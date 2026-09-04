import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import styles from "./CustomSelect.module.css";

export default function CustomSelect({ value, options, onChange, label, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div className={`${styles.wrap} ${disabled ? styles.disabled : ""}`} ref={ref}>
      {label && <span className={styles.label}>{label}</span>}
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className={styles.value}>{selected?.label || "Select..."}</span>
        <ChevronDown className={styles.icon} size={16} strokeWidth={2.5} />
      </button>
      
      {open && !disabled && (
        <div className={styles.menu}>
          {options.map((opt) => {
            const isActive = String(opt.value) === String(value);
            return (
              <button
                key={opt.value}
                type="button"
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className={styles.optionLabel}>{opt.label}</span>
                {opt.subLabel && <span className={styles.subLabel}>{opt.subLabel}</span>}
                {isActive && <Check className={styles.checkIcon} size={14} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
