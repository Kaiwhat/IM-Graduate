import React from "react";
import ReactDOM from "react-dom";

// import "./styles.css";

import App from "App";

const tasks = [
  {
    title: "todo",
    tasks: ["Read chapters for next class"]
  },
  {
    title: "doing",
    tasks: ["Complete in-class activity", "Brainsotrm project ideas"]
  },
  {
    title: "done",
    tasks: []
  }
];

const rootElement = document.getElementById("root");
ReactDOM.render(<App tasks={tasks} />, rootElement);
