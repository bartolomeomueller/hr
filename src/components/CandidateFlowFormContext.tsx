import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { CandidateGreetingForm } from "./CandidateGreetingForm";

type CandidateGreetingValues = {
  name: string;
  email: string;
};

type CandidateGreetingSubmit = (
  values: CandidateGreetingValues,
) => Promise<void>;

type CandidateFlowFormState = {
  visible: boolean;
  canSubmit: boolean;
  errorMessage: string | null;
  onSubmit: CandidateGreetingSubmit;
};

type CandidateFlowFormContextValue = {
  showForm: (options: Omit<CandidateFlowFormState, "visible">) => void;
  hideForm: () => void;
};

export const candidateFlowNoopSubmit: CandidateGreetingSubmit = async () => {};

const CandidateFlowFormContext =
  createContext<CandidateFlowFormContextValue | null>(null);

export function CandidateFlowFormProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [formState, setFormState] = useState<CandidateFlowFormState>({
    visible: false,
    canSubmit: false,
    errorMessage: null,
    onSubmit: candidateFlowNoopSubmit,
  });

  const showForm = useCallback(
    (options: Omit<CandidateFlowFormState, "visible">) => {
      setFormState({
        visible: true,
        ...options,
      });
    },
    [],
  );

  // NOTE This function param is useless since all params are overwritten anyway
  const hideForm = useCallback(() => {
    setFormState((previous) => ({
      ...previous,
      visible: false,
      canSubmit: false,
      errorMessage: null,
      onSubmit: candidateFlowNoopSubmit,
    }));
  }, []);

  // NOTE since we are using react compiler no useMemo
  // const contextValue = useMemo(
  //   () => ({
  //     showForm,
  //     hideForm,
  //   }),
  //   [hideForm, showForm],
  // );
  const contextValue = {
    showForm,
    hideForm,
  };

  return (
    <CandidateFlowFormContext.Provider value={contextValue}>
      {children}
      <div hidden={!formState.visible}>
        <CandidateGreetingForm
          canSubmit={formState.canSubmit}
          errorMessage={formState.errorMessage}
          onSubmit={formState.onSubmit}
        />
      </div>
    </CandidateFlowFormContext.Provider>
  );
}

// TODO use a ternary here?
export function useCandidateFlowForm() {
  const context = useContext(CandidateFlowFormContext);
  if (!context) {
    throw new Error(
      "useCandidateFlowForm must be used within CandidateFlowFormProvider.",
    );
  }

  return context;
}
