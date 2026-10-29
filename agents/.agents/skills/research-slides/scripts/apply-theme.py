#!/usr/bin/env python3
"""Write the Research Slides theme colours, faces and name into a .pptx (pptxgenjs cannot set them all).
usage: apply-theme.py deck.pptx"""
import sys, zipfile, re, shutil, os
COLORS = {'dk1':'000000','lt1':'FFFFFF','dk2':'595959','lt2':'F4F4F4','accent1':'9C6B1E','accent2':'1155CC','accent3':'188038','accent4':'CC0000','accent5':'CFE2F3','accent6':'FCE5CD','hlink':'0000EE','folHlink':'0000EE'}
def patch(xml):
    for k,v in COLORS.items():
        xml = re.sub(rf'(<a:{k}>)<a:(?:srgbClr|sysClr)[^>]*?(?:/>|>.*?</a:(?:srgbClr|sysClr)>)(</a:{k}>)', rf'\1<a:srgbClr val="{v}"/>\2', xml, count=1, flags=re.S)
    xml = re.sub(r'<a:clrScheme name="[^"]*"', '<a:clrScheme name="Research Slides"', xml)
    xml = re.sub(r'(<a:theme [^>]*?)name="[^"]*"', r'\1name="Research Slides"', xml, count=1)
    # faces: Arial for the title tier (major), Times New Roman for every other slide text (minor)
    xml = re.sub(r'(<a:majorFont>\s*<a:latin typeface=")[^"]*"', r'\1Arial"', xml, count=1)
    xml = re.sub(r'(<a:minorFont>\s*<a:latin typeface=")[^"]*"', r'\1Times New Roman"', xml, count=1)
    return xml
src = sys.argv[1]; tmp = src + '.tmp'
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if re.match(r'ppt/theme/theme\d+\.xml$', item.filename):
            data = patch(data.decode('utf-8')).encode('utf-8')
        zout.writestr(item, data)
shutil.move(tmp, src); print('theme applied:', src)
