"""Local regression checks. No Tinker sampling. Run this file with the project Python."""
import base64
from io import BytesIO
import json
import random
from types import SimpleNamespace
import unittest

from capture_fold import BrowserSession, CORPUS, DEFAULT_SAMPLES, load_task
from image_assets import ASSET_LIMIT, prepare_image, check_prompt_assets


class ImageTests(unittest.TestCase):
    def test_noisy_image_shrinks_under_byte_budget(self):
        from PIL import Image
        source = Image.frombytes("RGB", (1400, 900), random.Random(42).randbytes(1400 * 900 * 3))
        picture, data, info = prepare_image(source, max_edge=1024, max_bytes=180_000)
        self.assertLessEqual(max(picture.size), 1024)
        self.assertLessEqual(len(data), 180_000)
        self.assertLessEqual(info["renderer_jpeg_bytes"], 180_000)
        self.assertAlmostEqual(picture.width / picture.height, 1400 / 900, delta=.02)
        self.assertEqual(source.size, (1400, 900))

    def test_actual_asset_limit_is_checked(self):
        prompt = SimpleNamespace(chunks=[SimpleNamespace(type="image", data=b"x" * ASSET_LIMIT)])
        with self.assertRaises(ValueError):
            check_prompt_assets(prompt)
        with self.assertRaises(ValueError):
            check_prompt_assets(SimpleNamespace(chunks=[]))


class FoldTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = BrowserSession()
        cls.browser = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)

    def test_reference_replay_and_transactional_editing(self):
        for sample_id in DEFAULT_SAMPLES:
            with self.subTest(sample=sample_id):
                cp, target = load_task(sample_id)
                self.browser.init(cp, target)
                folds = json.loads((CORPUS / sample_id / "seq.json").read_text())["folds"]
                for fold in folds:
                    args = {k: fold[k] for k in ("angle_index", "offset", "move_positive", "over")}
                    result = self.browser.call("add_fold", args)
                    self.assertTrue(result["ok"], result)
                end = self.browser.call("get_state")
                self.assertTrue(self.browser.artifacts()["evaluation"]["pilot_match"])
                bad = self.browser.call("add_fold", {"angle_index": 0, "offset": 100,
                                                    "move_positive": True, "over": True})
                self.assertFalse(bad["ok"])
                self.assertEqual(end, self.browser.call("get_state"))
                for name, args in [("remove_fold", {"step": 0}), ("go_to_step", {"step": -1}),
                                   ("restore_revision", {"revision": 100000})]:
                    self.assertFalse(self.browser.call(name, args)["ok"])
                    self.assertEqual(end, self.browser.call("get_state"))
                middle = self.browser.call("remove_fold", {"step": 1})
                if middle["ok"]:
                    self.assertEqual(middle["state_id"], len(folds) - 1)
                else:
                    self.assertEqual(end, self.browser.call("get_state"))
                self.assertTrue(self.browser.call("restore_revision", {"revision": end["revision"]})["ok"])
                self.assertTrue(self.browser.call("remove_fold", {"step": len(folds)})["ok"])
                self.assertEqual(self.browser.call("get_state")["state_id"], len(folds) - 1)
                self.assertTrue(self.browser.call("go_to_step", {"step": 0})["ok"])
                self.assertEqual(self.browser.call("get_state")["sequence"], [])
                self.assertTrue(self.browser.call("restore_revision", {"revision": end["revision"]})["ok"])
                self.assertTrue(self.browser.artifacts()["evaluation"]["pilot_match"])
                self.assertEqual(self.browser.call("get_images", {"step": 0})["image_step"], 0)
                self.assertTrue(self.browser.call("finish")["finished"])

    def test_cp_match_does_not_hide_wrong_terminal_parity(self):
        cp, target = load_task(DEFAULT_SAMPLES[0])
        target['fo:faces_parity'][0] = 1 - target['fo:faces_parity'][0]
        self.browser.init(cp, target)
        folds = json.loads((CORPUS / DEFAULT_SAMPLES[0] / 'seq.json').read_text())['folds']
        for fold in folds:
            self.assertTrue(self.browser.call('add_fold', {k: fold[k] for k in
                ('angle_index', 'offset', 'move_positive', 'over')})['ok'])
        result = self.browser.call('finish')['evaluation']
        self.assertTrue(result['cp_match'])
        self.assertFalse(result['terminal_reference_match'])
        self.assertFalse(result['pilot_match'])

    def test_png_and_xray_density(self):
        from PIL import Image
        images = self.browser.page.evaluate("""async () => {
          const {captureViews, layersToPieces} = await import('../viewer/capture.js');
          const layer = {poly: [[0,0],[1,0],[1,1],[0,1]], par: 0};
          return [captureViews(layersToPieces([layer])), captureViews(layersToPieces([layer, layer]))];
        }""")
        means = []
        for views in images:
            self.assertEqual(set(views), {"top", "oblique", "reverse", "xray"})
            for name, url in views.items():
                data = base64.b64decode(url.split(",", 1)[1])
                self.assertTrue(data.startswith(b"\x89PNG"))
                self.assertLess(len(data), ASSET_LIMIT)
                with Image.open(BytesIO(data)) as im:
                    self.assertEqual(im.size, (512, 512))
                    if name == "xray":
                        means.append(sum(im.convert("RGB").getpixel((256, 280))))
        self.assertLess(means[1], means[0])


if __name__ == "__main__":
    unittest.main()
