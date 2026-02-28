import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp, Newline } from "ink";
import TextInput from "ink-text-input";
import type { XcodeProject } from "@ios-code/tools-xcode";
import type { Message } from "@ios-code/core";
import { parseSlashCommand, helpText, describeProject } from "./commands.js";

export interface AppProps {
  project: XcodeProject | null;
  onUserMessage: (input: string) => Promise<void>;
  onSlashCommand: (command: ReturnType<typeof parseSlashCommand>) => Promise<void>;
}

interface ChatMessage {
  role: "user" | "assistant" | "system" | "error";
  content: string;
}

export function ChatApp({
  project,
  onUserMessage,
  onSlashCommand,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "system",
      content: describeProject(project),
    },
    {
      role: "system",
      content: 'Type /help for available commands, or start chatting. Press Ctrl+C to exit.',
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useInput((_input, key) => {
    if (key.ctrl && _input === "c") {
      exit();
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

      const command = parseSlashCommand(trimmed);

      if (command) {
        if (command.type === "help") {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: helpText() },
          ]);
          return;
        }

        if (command.type === "unknown") {
          setMessages((prev) => [
            ...prev,
            {
              role: "error",
              content: `Unknown command: ${command.input}. Type /help for available commands.`,
            },
          ]);
          return;
        }

        setIsLoading(true);
        try {
          await onSlashCommand(command);
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            {
              role: "error",
              content: `Command failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(true);
        try {
          await onUserMessage(trimmed);
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            {
              role: "error",
              content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ]);
        } finally {
          setIsLoading(false);
        }
      }
    },
    [onUserMessage, onSlashCommand]
  );

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">
          ios-code
        </Text>
        <Text color="gray"> — iOS-focused Claude Code assistant</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1}>
        {messages.map((msg, i) => (
          <MessageLine key={i} message={msg} />
        ))}
        {isLoading && (
          <Box marginTop={1}>
            <Text color="cyan">thinking...</Text>
          </Box>
        )}
      </Box>

      {/* Input */}
      <Box marginTop={1} borderStyle="round" borderColor={isLoading ? "gray" : "green"} paddingX={1}>
        <Text color="green">{">"} </Text>
        {isLoading ? (
          <Text color="gray">(processing...)</Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Ask about iOS development or type /help..."
          />
        )}
      </Box>
    </Box>
  );
}

function MessageLine({ message }: { message: ChatMessage }): React.ReactElement {
  const colors: Record<ChatMessage["role"], string> = {
    user: "blue",
    assistant: "white",
    system: "gray",
    error: "red",
  };

  const prefixes: Record<ChatMessage["role"], string> = {
    user: "You",
    assistant: "ios-code",
    system: "•",
    error: "✖",
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={colors[message.role] as any} bold={message.role !== "system"}>
        {prefixes[message.role]}:{" "}
        <Text color={colors[message.role] as any} bold={false}>
          {message.content}
        </Text>
      </Text>
    </Box>
  );
}

export interface StreamAppendFn {
  appendMessage: (msg: ChatMessage) => void;
  appendToLast: (text: string) => void;
}

/**
 * Render the chat UI and return a handle for appending messages from outside React.
 */
export function startUI(
  project: XcodeProject | null,
  onUserMessage: AppProps["onUserMessage"],
  onSlashCommand: AppProps["onSlashCommand"]
): void {
  render(
    <ChatApp
      project={project}
      onUserMessage={onUserMessage}
      onSlashCommand={onSlashCommand}
    />
  );
}
