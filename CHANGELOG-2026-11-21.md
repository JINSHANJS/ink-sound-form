# Character controls first — 21 November 2026

The user requested moving the complete character operation panel above the other controls, then replacing the previous webpage in both GitHub repositories.

The panel now appears before Read, Compose and Files. This includes Select a character, Back to scroll, the character field, estimated-path information, Standard path, Free path, and reading status. The interface remains in English.

This release also synchronizes the previously local 18 November whole-scroll update: three primary reading methods remain usable, connected ink branches are continued across suitable junctions, short strokes are retained, and interactive character analysis uses lightweight estimated ink paths rather than launching InkSight CPU inference. The public backend uses the same estimated-path extraction as the local runtime. Writing order remains unverified.

The default scroll data now has 170 extracted paths. Historical archive records and figure measurements retain their original data. GitHub Pages remains the static browser preview; image processing and OBJ sealing require the full runtime.

Validation: JavaScript/Python syntax checks and browser verification of panel order, expanded character controls, and visibility of all three reading methods. Whole-scroll behavior was exercised with real mouse input in the previous local validation, including audio and completed 3D rendering.

Private source: my_work/object_3d/ink_sound_form/.
Public source: web/my_work/object_3d/ink_sound_form/.
Local backups and publication verification: Ink Sound Form/GitHub Sync 2026-11-21/.
