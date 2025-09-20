export default function Todo({ name, listId, todoId, updateEditState }) {

    //...

    const [, drag] = useDrag({
        item: { listId, todoId, type: ItemTypes.TODO }
    });

    //套用drag ref到既有的ref上
    drag(targetRef);

    return (
        <div
            className="todo text-wrap my-1 p-2 rounded"
            ref={targetRef}
            onMouseEnter={handleOnOver}
            onMouseLeave={handleOnLeave}
        >
            {name}
            {isOver && (
                <Button
                    className="edit-button m-1"
                    size="sm"
                    onClick={handelClickEdit}
                >
                    <FontAwesomeIcon icon={faPencilAlt} />
                </Button>
            )}
        </div>
    );
}