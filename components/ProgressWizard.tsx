
import React from 'react';
import { AppStep } from '../types';
import { CheckIcon } from './icons/CheckIcon';

interface ProgressWizardProps {
  currentStep: AppStep;
  onStepClick: (step: AppStep) => void;
}

const steps = [
  { id: AppStep.UPLOAD_IMAGES, name: 'Cargar' },
  { id: AppStep.EDIT_TEXT, name: 'Editar' },
  { id: AppStep.SELECT_VOICE, name: 'Elegir Voz' },
  { id: AppStep.GENERATE_AD, name: 'Generar' },
];

const ProgressWizard: React.FC<ProgressWizardProps> = ({ currentStep, onStepClick }) => {
  // Hide wizard during final generation and view result steps for a cleaner UI
  if (currentStep >= AppStep.GENERATING) {
    return null;
  }

  const getStepStatus = (stepId: AppStep) => {
    if (stepId < currentStep) return 'completed';
    if (stepId === currentStep) return 'current';
    return 'upcoming';
  };

  return (
    <nav aria-label="Progress" className="mb-8">
      <ol role="list" className="flex items-center">
        {steps.map((step, stepIdx) => {
          const status = getStepStatus(step.id);
          const isCurrent = status === 'current';
          
          return (
            <li key={step.name} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''} flex-1`}>
              {status !== 'upcoming' ? (
                <>
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="h-0.5 w-full bg-indigo-600" />
                  </div>
                  <button
                    onClick={() => onStepClick(step.id)}
                    className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-700 transition-colors"
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <CheckIcon className="h-5 w-5 text-white" />
                    <span className="sr-only">{step.name}</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="h-0.5 w-full bg-gray-700" />
                  </div>
                  <div
                    className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-700 bg-gray-800"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-transparent" />
                  </div>
                </>
              )}
               <span className={`absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm ${isCurrent ? 'font-semibold text-indigo-400' : 'text-gray-400'}`}>
                {step.name}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default ProgressWizard;
