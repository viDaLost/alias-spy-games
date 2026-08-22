# Biblical Treasures V45 — Rainbow special swipe

## Gameplay changes

- The Noah's Ark in-game booster is removed.
- Its fourth booster slot becomes **Радуга Завета**. It converts a chosen clear cell into a rainbow special piece.
- A rainbow special no longer requires a match. Swipe it with any ordinary symbol to clear:
  - the rainbow itself;
  - the swapped symbol;
  - every piece of that symbol type currently on the board.
- Horizontal/vertical staff specials activate on any valid adjacent swipe and clear their destination row/column.
- Jericho/burst specials activate on any valid adjacent swipe and clear the 3×3 area around their destination.
- Existing two-special combinations are preserved.
- Normal Ark tiles remain ordinary collectible symbols; only the Noah's Ark booster mechanic is removed.

## Compatibility

V45 patches the exported match-three core before the game starts so hint/no-moves discovery recognizes special-piece swipes as legal moves. The launcher also applies a guarded source transformation to the private booster table so the rainbow booster can create a real `special: "rainbow"` cell without duplicating game runtime state.
