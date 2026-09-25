const identifier = value => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error('Invalid RawTree identifier');
  return value;
};
// RawTree serializes inferred DateTime64 JSON values without a timezone. Our inputs
// are UTC; reattach it and trim sub-millisecond precision for portable browser parsing.
export function normalizeRawTreeTimestamp(value) {
  if (typeof value !== 'string') return value;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  return `${match[1]}T${match[2]}.${(match[3] || '').padEnd(3, '0').slice(0, 3)}Z`;
}
const validateRecord = record => {
  if (!record || typeof record !== 'object' || Array.isArray(record) || !record.record_id || !record.kind || !record.event_id || !record.ts) throw new Error('RawTree record requires record_id, kind, event_id and ts');
};
export class RawTree {
  constructor({env = process.env, fetchImpl = fetch} = {}) {
    this.key = env.RAWTREE_API_KEY;
    this.endpoint = (env.RAWTREE_ENDPOINT || env.RAWTREE_API_URL || 'https://api.rawtree.com').replace(/\/$/, '');
    this.database = identifier(env.RAWTREE_DATABASE || 'sitelens_hackathon');
    this.table = identifier(env.RAWTREE_TABLE || 'sitelens_hackathon');
    this.fetchImpl = fetchImpl;
    this._status = {configured: Boolean(this.key), connected: false, database: this.database, table: this.table, error: null};
  }
  get status() { return {...this._status}; }
  async request(path, body, method = 'POST') {
    if (!this.key) throw new Error('RAWTREE_API_KEY is not configured');
    try {
      const response = await this.fetchImpl(`${this.endpoint}${path}`, {
        method, headers: {Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', 'x-rawtree-database': this.database},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(15000)
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`RawTree HTTP ${response.status}: ${text.slice(0, 300)}`);
      this._status.connected = true; this._status.error = null; this._status.last_success_at = new Date().toISOString();
      return text ? JSON.parse(text) : {};
    } catch (error) { this._status.connected = false; this._status.error = error.message.replaceAll(this.key, '[redacted]'); throw new Error(this._status.error); }
  }
  async init() {
    const result = await this.request('/v1/databases', undefined, 'GET');
    if (!result.databases.some(db => db.name === this.database)) await this.request('/v1/databases', {name: this.database});
    const tables = await this.request('/v1/tables', undefined, 'GET');
    if (!(tables.tables || []).some(t => (typeof t === 'string' ? t : t.name) === this.table)) await this.request('/v1/tables', {name: this.table});
    return this.status;
  }
  async append(record) {
    validateRecord(record);
    return this.request(`/v1/tables/${this.table}`, record);
  }
  async appendBatch(records) {
    if (!Array.isArray(records)) throw new Error('RawTree batch must be an array');
    if (records.length === 0) return {inserted: 0};
    // Validate the full transaction before sending any of it. A failed or uncertain
    // response throws; the durable outbox can replay the same deterministic IDs.
    records.forEach(validateRecord);
    return this.request(`/v1/tables/${this.table}`, records);
  }
  async visibleRecordCount(records) {
    if (!Array.isArray(records)) throw new Error('RawTree visibility records must be an array');
    const ids = [...new Set(records.map(record => {
      const id = record?.record_id;
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Visibility check requires UUID record_id');
      return id;
    }))];
    let visible = 0;
    for (let index = 0; index < ids.length; index += 100) {
      const literals = ids.slice(index,index+100).map(id => `'${id}'`).join(',');
      const rows = await this.query(`SELECT uniqExact(JSONExtractString(toJSONString(__raw_data),'record_id')) AS visible_records FROM ${this.table} WHERE JSONExtractString(toJSONString(__raw_data),'record_id') IN (${literals})`);
      const count = Number(rows[0]?.visible_records);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('RawTree visibility count unavailable');
      visible += count;
    }
    return visible;
  }
  async query(sql) { return (await this.request('/v1/query', {sql})).data; }
  eventSQL() {
    // Retried append operations retain record_id; one event and latest kind win regardless of duplicate physical rows.
    return `SELECT JSONExtractString(payload, 'event_id') AS event_id,
      argMaxIf(payload, tuple(JSONExtractString(payload,'ts'), JSONExtractString(payload,'record_id')), JSONExtractString(payload,'kind') = 'detection') AS detection,
      argMaxIf(payload, tuple(JSONExtractString(payload,'ts'), JSONExtractString(payload,'record_id')), JSONExtractString(payload,'kind') = 'enrichment') AS enrichment_record,
      argMaxIf(payload, tuple(JSONExtractString(payload,'ts'), JSONExtractString(payload,'record_id')), JSONExtractString(payload,'kind') = 'verdict') AS verdict_record,
      argMaxIf(payload, tuple(JSONExtractString(payload,'ts'), JSONExtractString(payload,'record_id')), JSONExtractString(payload,'kind') = 'ack') AS ack_record,
      argMaxIf(payload, tuple(JSONExtractString(payload,'ts'), JSONExtractString(payload,'record_id')), JSONExtractString(payload,'kind') = 'correction') AS correction_record
      FROM (SELECT toJSONString(__raw_data) AS payload FROM ${this.table})
      WHERE JSONExtractString(payload,'kind') IN ('detection','enrichment','verdict','ack','correction')
      GROUP BY event_id HAVING detection != '' AND enrichment_record != ''`;
  }
  mapRow(row) {
    const parse = value => value ? (typeof value === 'string' ? JSON.parse(value) : value) : {};
    const detection = parse(row.detection), enriched = parse(row.enrichment_record), verdict = parse(row.verdict_record), ack = parse(row.ack_record), correction = parse(row.correction_record);
    const corrective_action = correction.corrective_action ? {...correction.corrective_action} : null;
    if (corrective_action) for (const key of ['completed_at','updated_at']) if(corrective_action[key]) corrective_action[key] = normalizeRawTreeTimestamp(corrective_action[key]);
    const raw = {...detection, ts: normalizeRawTreeTimestamp(detection.ts)};delete raw.kind;delete raw.record_id;
    return {...raw, raw, enrichment: enriched.enrichment, decision: enriched.decision, suppressed: Boolean(enriched.suppressed), verdict: verdict.verdict || null, acknowledged: Boolean(ack.acknowledged), acknowledged_at: normalizeRawTreeTimestamp(ack.ts) || null, corrective_action, closed: verdict.verdict === 'false_alarm' || Boolean(correction.closed)};
  }
  async allEvents() {
    const rows = await this.query(`SELECT *, count() OVER () AS total_event_count FROM (${this.eventSQL()}) ORDER BY JSONExtractString(detection,'ts') DESC, event_id DESC`);
    if(rows.length && Number(rows[0].total_event_count)!==rows.length) throw new Error('RawTree report query was truncated; refusing incomplete event export');
    return rows.map(row => this.mapRow(row));
  }
  async getEvent(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(id)) throw new Error('Invalid event_id');
    const rows = await this.query(`SELECT * FROM (${this.eventSQL()}) WHERE event_id = '${id}' LIMIT 1`);
    return rows.length ? this.mapRow(rows[0]) : null;
  }
  async feed({limit=200,offset=0}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isSafeInteger(offset)||offset<0) throw new Error('Invalid feed pagination');
    const base = this.eventSQL();
    const [rows, metricsRows] = await Promise.all([
      this.query(`SELECT * FROM (${base}) ORDER BY JSONExtractString(detection,'ts') DESC, event_id DESC LIMIT ${limit+1} OFFSET ${offset}`),
      this.query(`SELECT count() AS total_alerts, countIf(JSONExtractString(verdict_record,'verdict') = 'confirmed') AS confirmed,
        countIf(JSONExtractString(verdict_record,'verdict') = 'false_alarm') AS false_alarms,
        countIf(ack_record != '') AS acknowledged FROM (${base})
        WHERE JSONExtractBool(enrichment_record,'decision','violation') = true AND JSONExtractBool(enrichment_record,'suppressed') = false`)
    ]);
    const has_more = rows.length > limit;
    const events = rows.slice(0,limit).map(row => this.mapRow(row));
    const metrics = Object.fromEntries(Object.entries(metricsRows[0] || {}).map(([key,value]) => [key,Number(value)]));
    metrics.precision = metrics.total_alerts ? metrics.confirmed / metrics.total_alerts : null;
    metrics.reviewed_precision = (metrics.confirmed + metrics.false_alarms) ? metrics.confirmed / (metrics.confirmed + metrics.false_alarms) : null;
    metrics.source = 'rawtree_sql'; metrics.definition = 'confirmed / all unsuppressed violation alerts (including unreviewed)';
    return {events, metrics, pagination:{limit,offset,has_more,next_offset:has_more?offset+limit:null}};
  }
}
