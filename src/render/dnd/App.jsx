import React, { useState } from "react";
import { DndProvider } from "react-dnd";
import HTML5backend from "react-dnd-html5-backend";
// import "./TaskBoard.styles.scss";
import Column from "components/column";
import CustomDragLayer from "components/dragLayer";

const TaskBoard = props => {
  const [myTasks, moveMyTask] = useState(props.tasks);

  const handleMoveMyTask = (from, to) => {
    const { task, columnIndex: fromColumnIndex, index } = from;
    const { columnIndex: toColumnIndex } = to;

    const newMyTasks = [...myTasks];
    // remove task
    newMyTasks[fromColumnIndex].tasks.splice(index, 1);
    // move task
    newMyTasks[toColumnIndex].tasks.push(task);
    moveMyTask(newMyTasks);
  };

  const columns = myTasks.map((tasks, columnIndex) => {
    const propsToColumn = { tasks, columnIndex, handleMoveMyTask };
    return <Column key={`column ${columnIndex}`} {...propsToColumn} />;
  });

  return (
    <DndProvider backend={HTML5backend}>
      <CustomDragLayer />
      <div className="task-board">{columns}</div>
    </DndProvider>
  );
};

export default TaskBoard;
