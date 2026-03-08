# Brand Kits

## Purpose

Stage 9 introduces reusable brand kits so higher-level workflows can apply a consistent caption and export identity without hard-coding visual choices in the UI.

Brand kits are app-owned, typed, and versioned.

## Storage model

Brand kits are stored in app-local data, not inside each project document.

Current storage approach:

- built-in kits are defined in domain code
- user kits are stored in app data as versioned JSON
- projects store:
  - `settings.branding.defaultBrandKitId`
  - resolved caption-track branding snapshots when a kit is applied

This keeps projects portable while still allowing reusable local styling presets.

## Brand kit model

Each brand kit currently includes:

- `id`
- `version`
- `name`
- `description`
- `captionTemplateId`
- `captionStyleOverrides`
- `safeZoneDefaults`
- `exportPresetId`
- `logoWatermark`
- `introOutro`
- `source`

The current override surface covers:

- placement
- alignment
- font family intent
- font scale
- font weight
- text color
- accent color
- background style
- active-word style

## Stage 9 application behavior

Applying a brand kit to a caption track writes:

- `branding.brandKitId`
- resolved `styleOverrides`

That means:

- preview can keep rendering even if the original local kit is later missing
- subtitle export can render from the resolved style snapshot
- burn-in export can render from the same resolved style snapshot

## Built-in kits

Stage 9 ships at least:

- `clawcut-clean`
- `clawcut-social-pop`

These are examples, not a marketplace.

They prove the reusable packaging model for:

- caption templates
- export presets
- active-word styling defaults
- safe-zone layout defaults

## Workflow integration

Brand kits are first-class workflow inputs.

Current workflow usage:

- `captioned-export-v1` can apply a selected brand kit before export
- `batch-caption-export-v1` can apply a selected brand kit per batch item
- project defaults can be used when no explicit kit is supplied

This keeps higher-level automation consistent without baking style logic into workflow code.

## Preview and export integration

Brand kits do not render directly.

Instead they resolve through existing app-owned models:

- caption track
- caption template
- caption style overrides
- export preset

Preview and export then consume those resolved values through their normal paths.

## Current limitations

- brand kits are local-machine assets
- logo/watermark and intro/outro hooks are placeholders only
- there is no remote sharing or marketplace
- export preset bundling is reference-based, not a full preset inheritance system yet
