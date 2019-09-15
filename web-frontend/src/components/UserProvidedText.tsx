import React from "react";
export default ({
  children,
  fade = false
}: {
  children: React.ReactNode;
  fade?: boolean;
}) => (
  <span style={{ color: fade ? "rgba(0, 0, 0, 0.54)" : "rgba(0, 0, 0, 0.87)" }}>
    {children}
  </span>
);
