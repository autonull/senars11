// Mock implementation of Vercel AI SDK
export const generateText = async () => ({ text: "Mock response" });
export const streamText = async () => ({ textStream: [] });
export const tool = () => {};
export const generateObject = async () => ({ object: {} });
export const streamObject = async () => ({ partialObjectStream: [] });

// Mock providers
export const openai = () => {};
export const anthropic = () => {};
export const ollama = () => {};

// Factory functions
export const createOpenAI = () => (() => {});
export const createAnthropic = () => (() => {});
export const createOllama = () => (() => {});
