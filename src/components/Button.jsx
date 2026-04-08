import React from 'react';

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const baseStyle = "inline-flex items-center justify-center font-bold rounded-full transition-all duration-300 transform hover:-translate-y-1";
  
  const variants = {
    primary: "bg-[#39FF14] text-black hover:bg-[#30df11] shadow-[0_0_15px_rgba(57,255,20,0.4)] hover:shadow-[0_0_25px_rgba(57,255,20,0.6)] px-8 py-3",
    secondary: "bg-[#FF6B00] text-white hover:bg-[#e66000] shadow-[0_0_15px_rgba(255,107,0,0.4)] px-8 py-3",
    outline: "border-2 border-white text-white hover:bg-white hover:text-black px-8 py-3",
    ghost: "text-white hover:text-[#39FF14] px-4 py-2"
  };

  // We are using inline Tailwind-like utility classes but since we don't have Tailwind, we define these in index.css or use raw style.
  // Actually, wait, we are using Vanilla CSS, so let's use CSS classes!
  
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
