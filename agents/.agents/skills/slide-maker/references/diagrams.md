# Diagrams

Every architecture figure is drawn in draw.io, kept as a `.drawio` source next to its export, and placed on
the slide as the exported PNG (scale 2, which the theme places at 1:1) or SVG. Never redraw an architecture
on the slide with shapes, and never paste a screenshot of the editor.

```bash
<skill-dir>/scripts/drawio-export.sh figures/pipeline.drawio -o figures/pipeline        # PNG at scale 2
<skill-dir>/scripts/drawio-export.sh figures/pipeline.drawio -o figures/pipeline --svg  # + SVG
<skill-dir>/scripts/drawio-export.sh figures/all.drawio --page 2 -o figures/decoder     # one page of several
```

Start from `assets/diagram-kit.drawio` (preview: `assets/diagram-kit.png`): it holds one styled instance of
every element. Copy the element, keep its style string, change the label.

## Vocabulary

Left to right as data flows:

- **Scene or voxel grid**: `fig-grid` cells, occupied cells in `fig-voxel-n` with a `fig-stroke` outline; a cube outline for point clouds.
- **Token stacks**: a white rounded column with a black stroke holding 16px rounded cells: `fig-state` for hidden states, `fig-obj` for question and object tokens, `fig-query` with a white label for decoder queries, `fig-lat` for latents.
- **Backbone**: one tall `fig-llm` slab labelled in `fig-llm-label`, Times New Roman 18; LoRA badges on it, `fig-frozen` with ❄️ or `fig-trainable` with 🔥 (Times New Roman 11).
- **Modules** as rounded boxes: `fig-module` for encoders and attention blocks, `fig-decoder` for the mask decoder, `fig-head` for query MLPs and splits, `fig-projector` for projectors, `fig-text-decoder` for text and output heads.
- **Special tokens** (`<OBJxxx>`, `<SEG>`) as `fig-trainable` chips; repeated layers as dashed `fig-layer` frames; a whole stage as a dashed `fig-module` frame at 35% opacity; notes and losses in a `fig-note` box.
- **Lines**: data arrows in black at 1.2pt with a classic head, orthogonal; attention masks and "Bi-direction Attn" in dashed `fig-attn-red`; query-to-mask links as dotted oval-ended curves in `fig-dot-blue`, `fig-dot-orange`, `fig-dot-red`.
- Rounded corners (`rounded=1`) on every box, badge and cell; grid cells stay square.
- **Labels** are Times New Roman: 11 on badges, 15 for small labels and quoted inputs (Q: "Where is the chair?" in italic), 17 on boxes, 18 on the backbone, 19 inside a decoder layer. Equations are LaTeX in `\( … \)` with math enabled on the page; loss terms under a box are `fig-stroke` at 15.
- ❄️ and 🔥 beside LoRA badges are the only emoji in a diagram.

One diagram answers one question: a pipeline, a decoder, or a comparison of variants side by side with a
title over each (one page, one column per variant, exported once, not three slides).

## Colours

Each fill goes with its named stroke (`-line`).

| Token | Hex | Use |
| --- | --- | --- |
| `fig-llm` / `fig-llm-label` | `#f9c9a0` / `#b8336a` | backbone slab / its label |
| `fig-decoder` | `#fad4ea` | mask decoder |
| `fig-head` / `-line` | `#f9d5e5` / `#e6b0cb` | small heads, post-processing |
| `fig-text-decoder` / `-line` | `#fff2cc` / `#d6b656` | text decoder, output heads |
| `fig-module` / `-line` | `#dae8fc` / `#6c8ebf` | external or frozen modules; dashed stage frame |
| `fig-layer` / `-line` | `#e3eefb` / `#7a7a7a` | repeated layer frame (dashed) |
| `fig-projector` / `-line` | `#ffe6cc` / `#d79b00` | projectors, readouts |
| `fig-frozen` / `-line` / `-text` | `#b5e5c5` / `#6bbf8a` / `#3a6b4a` | frozen LoRA badge |
| `fig-trainable` / `-line` | `#e1d5e7` / `#9673a6` | trainable LoRA badge, special-token chips |
| `fig-state` / `-line` | `#66dd44` / `#2e7d32` | hidden-state and scene-token cells |
| `fig-obj` / `-line` | `#e7679c` / `#8b1a4a` | question and object tokens |
| `fig-query` / `-line` | `#e8679a` / `#9e2a5e` | decoder queries (white label) |
| `fig-lat` | `#84c6ee` | latent tokens (stroke `fig-stroke`) |
| `fig-grid` / `-line` | `#f7f7f7` / `#9e9e9e` | empty grid cells |
| `fig-voxel-1` … `-8` | `#e91e63` `#7e57c2` `#9c27b0` `#26c6da` `#4caf50` `#ff7043` `#ffc107` `#e040fb` | instances in a scene grid, in this order |
| `fig-note` / `-line` | `#f5f5f5` / `#666666` | notes and loss boxes |
| `fig-stroke` | `#555555` | stroke of voxels and latents; secondary labels |
| `fig-attn-red` | `#c0392b` | attention masks (dashed) |
| `fig-dot-blue` / `-orange` / `-red` | `#4fa8e8` / `#e39a4e` / `#f0857e` | query-to-mask links |

Plots keep their tool's styling; give the two series that matter `fig-voxel-1` and `fig-voxel-4`.
