let id: string | undefined;

/**
 * This tab's random name for the real-time channel, so the server can leave it out of the events
 * its own changes cause. Made on first use: Workers do not allow random values while a module
 * loads, and the server bundle imports this one.
 */
export const getTabId = () => (id ??= crypto.randomUUID());
