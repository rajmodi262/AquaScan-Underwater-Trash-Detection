import cv2, time
import ml_detector
import pipeline as pl

img_path = '../data/sample_images/ocean_trash_hires.jpg'
with open(img_path, 'rb') as f:
    img_bytes = f.read()

img = cv2.imread(img_path)
print(f'Image: {len(img_bytes)} bytes, {img.shape[1]}x{img.shape[0]}')

p = pl.Pipeline()
t0 = time.time()
result = p.process(img_bytes)
elapsed = time.time() - t0

s = result['summary']
objs = result['objects']
print(f'Debris density: {s["trash_density_pct"]}%')
print(f'Cells flagged: {s["trash_cells"]}/{s["total_cells"]}')
print(f'ML objects: {s.get("ml_objects", 0)}')
print(f'CV objects: {s.get("cv_objects", 0)}')
print(f'Total objects: {len(objs)}')
for i, o in enumerate(objs):
    print(f'  [{i+1}] {o["category"]} | {o.get("coco_name","")} | {o["confidence"]:.0%}')
