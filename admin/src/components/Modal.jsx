import { X } from 'lucide-react';
import './Modal.css';

export default function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`modal-panel${wide ? ' modal-panel-wide' : ''}`}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
