type TutorialAction = (...args: any[]) => void | Promise<void>;

const actions = new Map<string, TutorialAction>();

export const registerTutorialAction = (name: string, action: TutorialAction) => {
  actions.set(name, action);
  return () => {
    if (actions.get(name) === action) actions.delete(name);
  };
};

export const runTutorialAction = async (name: string, ...args: any[]) => {
  const action = actions.get(name);
  if (!action) return false;
  await action(...args);
  return true;
};
