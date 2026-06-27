import { useState, useRef } from "react";
import { createPortal } from "react-dom";

export default function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({top:0, left:0});
  const timerRef = useRef(null);
  const anchorRef = useRef(null);

  const show = () => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.top + window.scrollY, left: r.left + r.width / 2 + window.scrollX });
    }
    setVisible(true);
  };

  return (
    <div ref={anchorRef} style={{position:"relative",display:"inline-flex"}}
      onMouseEnter={()=>{ timerRef.current = setTimeout(show, 600); }}
      onMouseLeave={()=>{ clearTimeout(timerRef.current); setVisible(false); }}>
      {children}
      {visible && createPortal(
        <div style={{
          position:"absolute", top: pos.top - 8, left: pos.left,
          transform:"translate(-50%, -100%)",
          background:"#1a1a2e", border:"1px solid #3a3a5c", borderRadius:8,
          padding:"7px 14px", fontSize:12, color:"#c8c8d8", lineHeight:1.5,
          whiteSpace:"normal", width:"max-content", maxWidth:400, zIndex:99999,
          boxShadow:"0 4px 18px rgba(0,0,0,.65)", pointerEvents:"none", textAlign:"center",
        }}>
          {text}
          <div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",
            width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",
            borderTop:"6px solid #3a3a5c"}}/>
        </div>,
        document.body
      )}
    </div>
  );
}
