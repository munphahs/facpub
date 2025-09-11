// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import FacultyPubsDashboard from "./FacultyPubsDashboard.jsx";
import "./styles.css"; // if your styles live in src (recommended)

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FacultyPubsDashboard />
  </React.StrictMode>
);