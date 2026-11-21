# Archive capacity, deletion and foreground contrast

The user requested 100 archive records, the ability to delete individual records, improved foreground handling for non-black lettering, and research into better stroke-order recovery without integrating new models yet.

## Delivered interactions

- Capacity is 100 records. A new reading beyond that limit removes the oldest record, preserving the earlier retention policy with the larger capacity.
- Each record detail has Delete record, an inline permanent-delete confirmation and Cancel. Deletion removes only the selected IndexedDB record, including its stored image, score/trajectory and geometry. Previously downloaded files are independent.
- The library displays 20 records per page. Card previews use a smaller backing canvas, and the detail/grid DOM is released on close. Existing version-one databases are retained; no destructive migration or requirement to close older tabs is introduced. Retention and library ordering keep lightweight ID/date headers rather than retaining all 100 full records in memory.
- Image analysis determines foreground polarity from the image luminance and normalizes dark backgrounds internally. Additional per-channel contrast detects saturated colours with weak luminance contrast, such as blue on black. Dominant red writing is preserved while the existing isolated-seal filtering remains for the original scroll. The source photograph displayed or archived is never recoloured.
- These image changes affect ink extraction, not historical writing-order verification.

## Verification

A dedicated automated browser profile was seeded with 101 test records and then a real new archive was generated: exactly 100 remained and the oldest records were removed. Opening the library showed 20 previews. Cancel preserved all records; permanent deletion removed only the selected record and reduced the count to 99. Closing the library cleared its preview DOM.

Controlled black-on-white, white-on-black, red-on-white, blue-on-white, blue-on-black and white-on-blue versions of identical calligraphy silhouettes produced the same 170 paths and identical extracted masks in the comparison. The original colour photograph and its inverted version both produced 170 paths. Actual browser uploads of the inverted photograph, red-on-white and blue-on-black cases succeeded and kept the original displayed image. These controlled checks are not a claim of accuracy on all historical rubbing photographs.

The existing static-browser regression suite additionally exercises light foreground handling, 100-record retention, cancellation and deletion, while continuing to test upload, character opening, audio, completed 3D and sealed OBJ export.

## Research only: no model integration

- StrokeExtraction / SDNet: https://github.com/MengLi-l1/StrokeExtraction — semantic stroke categories and reference-stroke registration. The official README supplies training and auxiliary model links; complete ready-to-run weights and redistribution terms need verification. Cursive source-specific stroke order has not been benchmarked here.
- WOR: https://github.com/gioelecrispo/wor — MIT-licensed MATLAB writing-order recovery with complex trajectory examples. It includes geometric/heuristic decisions and is not evidence of semantic Chinese cursive mastery; browser integration would need a port or service.
- CalliReader: https://github.com/LoYuXr/CalliReader — released calligraphy recognition/understanding code and weights, useful as an identity-recognition component. Its documented interface is not an ordered trajectory API.
- Ordered stroke instance prediction: https://arxiv.org/html/2609.02251v1 — directly addresses inter-stroke order and within-stroke motion, but the paper states implementation code is available from the first author upon reasonable request. It is not a verified drop-in open-source package.

A practical next evaluation would compare recovered stroke identities, starts/ends and full order against verified demonstrations of the user's actual cursive samples. Standard printed-character stroke order must not be silently substituted for the original cursive writing.

Both GitHub folders and the local authoring/application copies are synchronized. Browser processing files retain parity with the backend extractor. Public deployment and live verification follow the local checks.
