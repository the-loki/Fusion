import { useCallback } from "react";
import { X } from "lucide-react";
import { SetupWizard } from "./SetupWizard";
import type { ProjectInfo, ProjectCreateInput } from "../api";

export interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (project: ProjectInfo) => void;
  onRegisterProject: (input: ProjectCreateInput) => Promise<ProjectInfo>;
}

/**
 * SetupWizardModal - Modal wrapper for the SetupWizard component
 * 
 * Provides a modal overlay for the setup wizard, suitable for:
 * - First-run experience when no projects exist
 * - "Add Project" button from ProjectOverview
 */
export function SetupWizardModal({
  isOpen,
  onClose,
  onComplete,
  onRegisterProject,
}: SetupWizardModalProps) {
  const handleProjectCreated = useCallback((project: ProjectInfo) => {
    onComplete(project);
  }, [onComplete]);

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay open" 
      onClick={(e) => {
        // Close on overlay click, but not when clicking the modal itself
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      data-testid="setup-wizard-modal-overlay"
    >
      <div 
        className="modal modal-lg" 
        onClick={(e) => e.stopPropagation()}
        data-testid="setup-wizard-modal"
      >
        <div className="modal-header">
          <h3>Add New Project</h3>
          <button 
            className="modal-close" 
            onClick={onClose}
            aria-label="Close"
            data-testid="setup-wizard-modal-close"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="modal-content-no-padding">
          <SetupWizard
            isOpen={isOpen}
            onClose={onClose}
            onProjectCreated={handleProjectCreated}
            onRegisterProject={onRegisterProject}
          />
        </div>
      </div>
    </div>
  );
}
