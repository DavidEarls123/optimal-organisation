import { useCallback, useMemo, useRef, useState } from 'react';

import { dropSlots, type DropSlot } from '../domain/week';

/** Holding a row and dragging it through a list that is split into headings.
 *
 *  All of this is geometry, and geometry is the part that goes wrong quietly:
 *  a drop line that points at one row while the drop lands at another, a
 *  heading you can never reach the top of, a folded-away row that takes up
 *  distance it does not take up on the screen. It is written once, here, so a
 *  second list cannot get a second opinion.
 *
 *  Rows are measured rather than assumed, because a row with its panel open is
 *  several times the height of one without. Three numbers, because the layout
 *  is three deep: the heading block, its list of rows, then the row. */
export function useListDrag({ order, sections, hidden, onDrop }: {
  /** What is drawn, in the order it is drawn. */
  order: { id: string; sec: string }[];
  /** The headings, in the order they are drawn. */
  sections: string[];
  /** Anything in the order that is not on the screen. */
  hidden?: string[];
  onDrop: (id: string, at: number, sec: string) => void;
}) {
  const secY = useRef<Record<string, number>>({});
  const listY = useRef<Record<string, number>>({});
  const rowY = useRef<Record<string, number>>({});
  const rowH = useRef<Record<string, number>>({});

  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<(DropSlot & { y: number }) | null>(null);

  const away = useMemo(() => hidden ?? [], [hidden]);

  /** Every place the dragged row could land, each with the point down the
   *  screen it belongs to. The gap under one heading's last row and the gap
   *  above the next heading's first row are different places, which is what
   *  makes dropping something at the top of a heading possible at all. */
  const placesFor = useCallback((id: string) => {
    const slots = dropSlots(order, sections, away, id);
    const yOf = (slot: DropSlot) => {
      const base = (secY.current[slot.sec] ?? 0) + (listY.current[slot.sec] ?? 0);
      if (slot.before) return base + (rowY.current[slot.before] ?? 0);
      if (slot.after) {
        return base + (rowY.current[slot.after] ?? 0) + (rowH.current[slot.after] ?? 44);
      }
      return base;
    };
    return slots.map((slot) => ({ ...slot, y: yOf(slot) }));
  }, [order, sections, away]);

  /** Where the dragged row's top would be if you let go now, and the place
   *  nearest to it. The rows below it are still drawn where they were, so
   *  anything past where it started is a row-height too low. */
  const nearest = useCallback((id: string, dy: number) => {
    const row = order.find((x) => x.id === id);
    if (!row) return null;
    const from = (secY.current[row.sec] ?? 0) + (listY.current[row.sec] ?? 0)
      + (rowY.current[id] ?? 0);
    const tall = rowH.current[id] ?? 44;
    const top = from + dy;

    let best: ReturnType<typeof placesFor>[number] | null = null;
    let gap = Infinity;
    for (const slot of placesFor(id)) {
      const y = slot.y > from ? slot.y - tall : slot.y;
      const d = Math.abs(y - top);
      if (d < gap) { gap = d; best = slot; }
    }
    return best;
  }, [order, placesFor]);

  const onDragMove = useCallback((id: string, dy: number) => {
    setDragId((cur) => (cur === id ? cur : id));
    const to = nearest(id, dy);
    setDrop((cur) => (cur && to && cur.sec === to.sec && cur.before === to.before ? cur : to));
  }, [nearest]);

  const onDragEnd = useCallback((id: string, dy: number) => {
    const to = nearest(id, dy);
    setDragId(null);
    setDrop(null);
    if (to) onDrop(id, to.at, to.sec);
  }, [nearest, onDrop]);

  /** Where the line goes inside a heading's list, measured from the same place
   *  the drop itself is, so the two cannot disagree. Null when the finger is
   *  not over this heading. */
  const lineIn = useCallback((sec: string) => (drop && drop.sec === sec
    ? drop.y - (secY.current[sec] ?? 0) - (listY.current[sec] ?? 0)
    : null), [drop]);

  return {
    dragId,
    lineIn,
    onDragMove,
    onDragEnd,
    /** Hand these to onLayout, innermost last. */
    measureSection: (sec: string, y: number) => { secY.current[sec] = y; },
    measureList: (sec: string, y: number) => { listY.current[sec] = y; },
    measureRow: (id: string, y: number, h: number) => { rowY.current[id] = y; rowH.current[id] = h; },
  };
}
