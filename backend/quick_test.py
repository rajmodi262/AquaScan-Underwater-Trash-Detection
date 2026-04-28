"""Quick test to verify v4.1 detection on sample images."""
import cv2
import sys
sys.path.insert(0, '.')
from pipeline import Pipeline
from config import DetectionConfig

def test_image(path, name):
    img = cv2.imread(path)
    if img is None:
        print(f"SKIP {name}: could not load")
        return
    _, buf = cv2.imencode('.jpg', img)
    pipe = Pipeline()
    cfg = DetectionConfig(enable_multi_scale=False)
    result = pipe.process(buf.tobytes(), grid_rows=4, grid_cols=4, cfg=cfg)
    s = result['summary']
    print(f"\n=== {name} ===")
    print(f"  Density: {s['trash_density_pct']}%")
    print(f"  Flagged: {s['trash_cells']}/{s['total_cells']}")
    print(f"  Objects: {s['objects_detected']}")
    print(f"  Time: {s['processing_time_ms']}ms")
    for obj in result['objects'][:5]:
        print(f"    -> {obj['category']} ({obj['confidence']*100:.0f}%) area={obj['area']}")
    for c in result['cells']:
        flag = 'X' if c['is_trash'] else '.'
        score = c['anomaly_score'] * 100
        color = c['color_ratio'] * 100
        obj_s = c['object_score'] * 100
        print(f"    Cell {c['label']}: {flag} score={score:.0f}% color={color:.0f}% obj={obj_s:.0f}%")

test_image('../data/sample_images/test.jpg', 'test - coral reef + trash')
test_image('../data/sample_images/test1.jpg', 'test1 - seafloor bottles')
test_image('../data/sample_images/test2.jpg', 'test2 - seafloor debris')
test_image('../data/sample_images/test7.jpg', 'test7 - clean water')
