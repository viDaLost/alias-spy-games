---
name: design-md-library
description: Library of 74 ready-made DESIGN.md design-system analyses of real brands (Stripe, Linear, Vercel, Apple, Airbnb, Notion, Spotify, Tesla, Claude and more) from VoltAgent/awesome-design-md. Use when the user wants a UI that looks or feels like a named brand/site, asks for a DESIGN.md, or needs a concrete visual reference (colors, typography, spacing, components) to build a consistent interface.
---

# DESIGN.md library

Each `designs/<brand>/DESIGN.md` is a plain-markdown design system extracted from a real website: YAML front matter with color, typography, spacing and radius tokens, followed by prose rules for layout, components, motion and do/don't lists. Format follows Google Stitch's DESIGN.md concept.

## How to use

1. Pick the closest brand from the index below (match on the user's named reference, or on vibe: dark tech, warm editorial, luxury automotive, fintech, playful consumer, etc.). If several fit, name the 2–3 candidates and pick one; don't load them all.
2. Read only that file: `designs/<brand>/DESIGN.md` (relative to this skill's directory). Files are large; read the token block and the sections you need.
3. Either copy it into the project root as `DESIGN.md` (when the user wants the project to adopt that design language), or use it as a reference while building.
4. Treat it as an *inspired* reference, not a clone: never ship the brand's logo, trademarked names or proprietary fonts as the user's own identity. Substitute licensed or free fonts (the file usually lists fallbacks) and adapt the palette to the user's brand when they have one.
5. Combine with `design-taste-frontend` / `impeccable` if those skills are present: this library supplies the visual language, they supply the craft rules.

## Index

| Brand | Design language |
| --- | --- |
| `airbnb` | A warm, generous consumer marketplace anchored on a clean white canvas and Airbnb Rausch (#ff385c), the single brand voltage that carries every pri… |
| `airtable` | A sober, editorial workflow-software interface anchored on white canvas and dark-ink type, where brand voltage comes from full-bleed signature card… |
| `apple` | A photography-first interface that turns marketing into a museum gallery. |
| `binance` | A confident financial-platform interface anchored on a deep near-black canvas, where Binance's iconic yellow (#FCD535) carries every primary CTA, b… |
| `bmw` | BMW's corporate site |
| `bmw-m` | A motorsport-engineering interface anchored on a near-black canvas with white BMW Type Next Latin display headlines in confident UPPERCASE. |
| `bugatti` | An austere luxury-automotive interface that uses near-pure black canvas, white uppercase letterspaced display, and full-bleed automotive photograph… |
| `cal` | A clean, calendar-software-first interface anchored on white canvas with black primary CTAs and custom Cal Sans display typography. |
| `claude` | A warm-canvas editorial interface for Anthropic's Claude product. |
| `clay` | A vibrant claymation-meets-data interface for Clay.com (GTM data-orchestration platform). |
| `clickhouse` | A high-performance database interface anchored on near-pure black canvas with electric yellow as the brand voltage. |
| `cohere` | Cohere's 2026 web system is a controlled enterprise AI interface built from stark white editorial space, deep green-black product bands, soft miner… |
| `coinbase` | An institutional-grade crypto exchange whose marketing surfaces read like a quietly-confident financial-services brand. |
| `composio` | A developer-tools brand for AI-agent tool integration whose marketing surfaces lean into a dark, technical aesthetic with a single deep-electric-bl… |
| `cursor` | An AI-first code editor whose marketing site reads like a quietly-confident developer-tools brand with a warm-cream editorial canvas (`#f7f7f4`) in… |
| `dell-1996` | An inspired interpretation of Dell.com's 1996 design language |
| `elevenlabs` | A voice-AI brand whose marketing surfaces read like a quietly editorial print magazine. |
| `expo` | A React Native developer-platform whose marketing site reads like a quietly-confident infrastructure brand. |
| `ferrari` | A luxury-automotive brand whose marketing surfaces read as cinematic editorial. |
| `figma` | A confident black-and-white editorial frame interrupted by oversized, hand-cut pastel color blocks. |
| `framer` | A confident dark-canvas builder marketing site that treats the page like a working artboard |
| `hashicorp` | An enterprise-infrastructure marketing canvas built around a near-black ground (#000000) and a system of per-product accent colors |
| `hp` | An inspired interpretation of HP's design language |
| `ibm` | An enterprise-marketing canvas faithful to Carbon Design System: white surfaces, charcoal type, IBM Blue (#0f62fe) as the single confident accent,… |
| `intercom` | An editorial customer-service marketing canvas built around a soft cream-white ground, charcoal type set in Saans (Intercom's proprietary geometric… |
| `kraken` |  |
| `lamborghini` |  |
| `linear.app` | A near-black product-focused marketing canvas built around #010102 (the deepest dark surface of any tool in this collection), light gray text (#f7f… |
| `lovable` |  |
| `mastercard` |  |
| `meta` | Meta's design system spans hardware commerce (Quest VR, Ray-Ban Meta AI glasses) and brand surfaces with a confident product-merchandising voice. |
| `minimax` | MiniMax presents itself as a premium AI infrastructure brand through a striking duality |
| `mintlify` | Mintlify presents documentation infrastructure with a dual-mode aesthetic |
| `miro` | Miro presents itself as the AI-powered visual workspace through a confident, almost playful brand voice |
| `mistral.ai` | Mistral AI brands itself with a singular signature |
| `mongodb` | MongoDB carries a strong dual-mode visual identity |
| `nike` | / |
| `nintendo-2001` | An analysis of Nintendo.com's 2001 design language |
| `notion` | Notion presents itself as the all-in-one workspace through a confident, illustration-rich brand voice |
| `nvidia` | / |
| `ollama` | / |
| `opencode.ai` | / |
| `pinterest` | / |
| `playstation` | / |
| `posthog` | / |
| `raycast` | / |
| `renault` | / |
| `replicate` | / |
| `resend` | / |
| `revolut` | / |
| `runwayml` |  |
| `sanity` |  |
| `sentry` | An inspired interpretation of Sentri's design language |
| `shopify` | An inspired interpretation of Shopifi's design language |
| `slack` | An inspired interpretation of Slacc's design language |
| `spacex` | An inspired interpretation of Spasex's design language |
| `spotify` |  |
| `starbucks` |  |
| `stripe` | An inspired interpretation of Stripi's design language |
| `supabase` | An inspired interpretation of Supabaze's design language |
| `superhuman` | An inspired interpretation of Superhumon's design language |
| `tesla` |  |
| `theverge` |  |
| `together.ai` | An inspired interpretation of Together AI's design language |
| `uber` | An inspired interpretation of Uber's design language |
| `vercel` | An inspired interpretation of Vercel's design language |
| `vodafone` | An inspired interpretation of Vodafone's design language |
| `voltagent` | An inspired interpretation of Voltagent's design language |
| `warp` | An inspired interpretation of Warp's design language |
| `webflow` | An inspired interpretation of Webflow's design language |
| `wired` | An inspired interpretation of Wired's design language |
| `wise` | An inspired interpretation of Wise's design language |
| `x.ai` | An inspired interpretation of xAI's design language |
| `zapier` | An inspired interpretation of Zapier's design language |

Source: https://github.com/VoltAgent/awesome-design-md (MIT, see LICENSE). More at https://getdesign.md.
