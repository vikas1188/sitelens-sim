#!/usr/bin/env python3
"""Exercise real local Liquid generation; optionally pass an image for vision."""
import base64, json, os, pathlib, sys, urllib.request
root = pathlib.Path(__file__).resolve().parents[1]
base = os.getenv('LIQUID_BASE_URL')
if not base and (root/'.runtime/liquid.env').exists():
    base = dict(line.split('=',1) for line in (root/'.runtime/liquid.env').read_text().splitlines())['LIQUID_BASE_URL']
base = base or 'http://127.0.0.1:8089/v1'
prompt = 'Reply ONLY with JSON: {"status":"ready","model":"Liquid"}'
content = prompt
if len(sys.argv)>1:
    raw=pathlib.Path(sys.argv[1]).read_bytes()
    mime='image/png' if raw.startswith(b'\x89PNG') else 'image/jpeg'
    content=[{'type':'text','text':'You are a construction safety inspector. Look at this image. Reply ONLY with JSON: {"workers_visible": int, "all_wearing_hardhats": bool, "all_wearing_hiviz": bool, "violation": bool, "description": string}. No visible people means no violation.'}, {'type':'image_url','image_url':{'url':f'data:{mime};base64,'+base64.b64encode(raw).decode()}}]
request=urllib.request.Request(base+'/chat/completions',data=json.dumps({'model':'LFM2.5-VL-450M','messages':[{'role':'user','content':content}],'temperature':0,'max_tokens':256,'response_format':{'type':'json_object'}}).encode(),headers={'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=180) as response: data=json.load(response)
result=json.loads(data['choices'][0]['message']['content'])
if len(sys.argv)>1:
    assert isinstance(result.get('workers_visible'),int),result
    for key in ('all_wearing_hardhats','all_wearing_hiviz','violation'): assert isinstance(result.get(key),bool),result
else: assert result['status']=='ready',result
print(json.dumps({'pass':True,'endpoint':base,'result':result,'usage':data.get('usage')},indent=2))
