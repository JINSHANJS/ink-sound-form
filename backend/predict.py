import sys,os,json,re
from pathlib import Path
import xml.etree.ElementTree as ET
root=Path.cwd()
(root / 'tools').mkdir(exist_ok=True)
model_dir = Path(__file__).resolve().parents[1] / 'vendor/callirewrite'
input_path=Path(sys.argv[1]).resolve();output_path=Path(sys.argv[2]).resolve()
sys.path.insert(0,str(model_dir))
import test_vectorization as model
original=model.load_checkpoint
def load(sess,path,**kwargs):
    if kwargs.get('perceptual_only'):return 'unused-evaluation-only'
    return original(sess,path,**kwargs)
model.load_checkpoint=load
model.main('new_train_phase_2',str(input_path),1)
from tools.svg_conversion import data_convert_to_absolute
npz=root/'outputs/sampling/__new_train_phase_2/seq_data'/(input_path.stem+'.npz')
data_convert_to_absolute(str(npz),'cluster')
tree=ET.parse(npz.parent/input_path.stem/'cluster.svg')
paths=[]
for element in tree.getroot():
    values=re.findall(r'[MQ]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?',element.attrib.get('d',''))
    i=0;points=[];prev=None
    while i<len(values):
        command=values[i];i+=1
        if command=='M':
            prev=[float(values[i]),float(values[i+1])];i+=2;points.append(prev)
        elif command=='Q':
            control=[float(values[i]),float(values[i+1])];end=[float(values[i+2]),float(values[i+3])];i+=4
            for j in range(1,17):
                t=j/16
                points.append([(1-t)**2*prev[k]+2*(1-t)*t*control[k]+t*t*end[k] for k in (0,1)])
            prev=end
    if len(points)>2:paths.append([[max(0,min(1,x/256)),max(0,min(1,y/256))] for x,y in points])
output_path.write_text(json.dumps({'source':'CalliRewrite phase 2','verified':False,'paths':paths}))
