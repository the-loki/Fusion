import type { CSSProperties, ComponentProps } from "react";
import { TaskCard } from "@fusion/dashboard/app/components/TaskCard";
import "./GraphTaskNode.css";

type TaskCardComponentProps = ComponentProps<typeof TaskCard>;

type TaskCardBridgeProps = Pick<
  TaskCardComponentProps,
  | "task"
  | "projectId"
  | "onOpenDetail"
  | "addToast"
  | "globalPaused"
  | "onUpdateTask"
  | "onArchiveTask"
  | "onUnarchiveTask"
  | "onDeleteTask"
  | "onRetryTask"
  | "onOpenDetailWithTab"
  | "taskStuckTimeoutMs"
  | "onOpenMission"
  | "onMoveTask"
  | "lastFetchTimeMs"
  | "workflowStepNameLookup"
>;

export interface GraphTaskNodeProps extends TaskCardBridgeProps {
  style?: CSSProperties;
  isHighlighted?: boolean;
}

export function GraphTaskNode({ style, isHighlighted = false, ...taskCardProps }: GraphTaskNodeProps) {
  return (
    <div
      className={`graph-task-node${isHighlighted ? " graph-task-node--highlighted" : ""}`}
      style={style}
      draggable={false}
      data-testid={`graph-task-node-${taskCardProps.task.id}`}
    >
      <TaskCard {...taskCardProps} disableDrag={true} />
    </div>
  );
}
