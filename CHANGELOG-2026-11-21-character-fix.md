# Public character opening fix — 21 November 2026

The user reported that Open character did not respond on GitHub Pages. The static preview's capture-phase click handler still blocked that action before the character handler ran. The previous release validated the local runtime rather than this deployed interaction.

Open character is no longer blocked. GitHub Pages reuses the bundled full-scroll ink paths inside the selected crop, transforms them into crop coordinates, and passes them through the existing standard/free reading, audio and 3D workflow. Each contiguous portion is kept separately; cropped-out travel is not joined across blank space. These are saved estimated ink paths, not newly inferred or verified historical stroke order. Local/full-server character analysis retains its normal backend route. Script versions are incremented to refresh cached code.

Validation uses actual mouse selection and Open character clicks with the Pages adapter loaded, then Standard path, audio and completed 3D generation; a final deployed-site check follows publication.
