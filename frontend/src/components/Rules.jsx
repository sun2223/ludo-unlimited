import React, { useEffect, useRef } from 'react';
import { Icon } from './Icons.jsx';
export function Rules({ onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog ref={dialog} onCancel={onClose} className="rules-dialog">
      <div className="panel-heading">
        <span className="eyebrow">A QUICK REFRESHER</span>
        <button className="icon-button" aria-label="Close rules" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <h2>A classic for a reason.</h2>
      <p>
        Bring 2–4 friends. Get all four of your tokens from the yard to the center before anyone
        else.
      </p>
      <ol>
        <li>
          <b>Roll a six to enter.</b> On your turn, roll the die and choose a highlighted token. A
          six gives another roll; three consecutive sixes end your turn.
        </li>
        <li>
          <b>Race around the board.</b> Each token follows the outer track, then its own colored
          home lane. You need an exact roll to finish.
        </li>
        <li>
          <b>Send a rival home.</b> Land on an opponent to return them to their yard. Star squares
          and colored starting squares are safe. Two tokens of one color form a blockade on an
          unsafe square: nobody can land on or pass it.
        </li>
        <li>
          <b>Keep the good luck going.</b> A capture or a token reaching home gives another roll.
          First to bring all four home wins. Rematch as often as you like.
        </li>
      </ol>
      <p className="muted">
        Lost connection? Keep this browser tab and we’ll restore your seat. The host can skip a turn
        after a player has been offline for 60 seconds.
      </p>
      <button className="primary full" onClick={onClose}>
        Let’s play <Icon name="arrow" />
      </button>
    </dialog>
  );
}
