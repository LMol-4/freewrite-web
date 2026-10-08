# Bundled font provenance

Reviewed 2026-10-07. Existing Google Fonts latin WOFF2 subsets; no binaries changed.
SHA256SUMS pins the files. fontTools confirms U+0020 through U+007E in every cmap.
This establishes English ASCII coverage, not complete multilingual coverage.

## EBGaramond-Regular.woff2

Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12)

Version 1.003

## Lato-Regular.woff2

Copyright (c) 2010-2011 by tyPoland Lukasz Dziedzic with Reserved Font Name "Lato". Licensed under the SIL Open Font License, Version 1.1.

Version 1.104; Western+Polish opensource

## Lato-Black.woff2

Added 2026-10-08 for the public-page heading, weight 900 (Latin subset).
Source: https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh50XSwiPGQ.woff2
Redistributed under the adjacent `lato-OFL.txt` (SIL OFL 1.1).

## LibreBaskerville-Regular.woff2

Copyright 2012 The Libre Baskerville Project Authors (https://github.com/impallari/Libre-Baskerville)

Version 2.005

## NotoSerifKannada-Regular.woff2

Copyright 2022 The Noto Project Authors (https://github.com/notofonts/kannada)

Version 2.005

Adjacent family-specific OFL notices were downloaded from
https://github.com/google/fonts/tree/main/ofl (each family directory).
The embedded Lato copyright above supplements the upstream notice.
All four are redistributed under SIL OFL 1.1.

The fetch script selects latin, fails on HTTP errors, and requires the pinned
hash before replacing a file. A changed upstream response requires deliberate
version, licence and glyph review before updating the manifest.
