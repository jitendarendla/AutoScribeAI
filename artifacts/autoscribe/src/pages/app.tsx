import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useListChats,
  useCreateChat,
  useGetChat,
  useUpdateChat,
  useDeleteChat,
  useGenerate,
  useUploadFile,
  useListSavedOutputs,
  useCreateSavedOutput,
  useDeleteSavedOutput,
  useCreateShareLink,
  useGetStats,
  useToggleSaveChat,
  useListFiles,
  useListSharedLinks,
  getListChatsQueryKey,
  getListSavedOutputsQueryKey,
  getGetStatsQueryKey,
  getGetChatQueryKey,
  getListFilesQueryKey,
  getListSharedLinksQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme-provider";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  MessageSquare,
  Plus,
  Trash2,
  FileText,
  Code2,
  BookOpen,
  Lightbulb,
  Send,
  Paperclip,
  Copy,
  Download,
  Moon,
  Sun,
  Menu,
  Star,
  Share2,
  Layout,
  User,
  LogOut,
  Link,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronLeft,
  StarOff,
  Mic,
  MicOff,
  Save,
  FolderOpen,
  History,
} from "lucide-react";

type Mode = "Report" | "Code" | "Documentation" | "Insight";
type Template = "general" | "university" | "experiment" | "project";
type SidebarSection =
  | "recent"
  | "saved"
  | "files"
  | "templates"
  | "shared"
  | "profile";

interface ParsedAiContent {
  report: string;
  code: string;
  docs: string;
  insights: string;
}

const MODES: {
  id: Mode;
  label: string;
  icon: React.ReactNode;
  color: string;
  accent: string;
}[] = [
  {
    id: "Report",
    label: "Report",
    icon: <FileText className="w-4 h-4" />,
    color: "text-blue-500",
    accent: "ring-blue-500/30 bg-blue-500/10 text-blue-500",
  },
  {
    id: "Code",
    label: "Code",
    icon: <Code2 className="w-4 h-4" />,
    color: "text-purple-500",
    accent: "ring-purple-500/30 bg-purple-500/10 text-purple-500",
  },
  {
    id: "Documentation",
    label: "Docs",
    icon: <BookOpen className="w-4 h-4" />,
    color: "text-emerald-500",
    accent: "ring-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  },
  {
    id: "Insight",
    label: "Insights",
    icon: <Lightbulb className="w-4 h-4" />,
    color: "text-amber-500",
    accent: "ring-amber-500/30 bg-amber-500/10 text-amber-500",
  },
];

const TEMPLATES: { id: Template; label: string }[] = [
  { id: "general", label: "General Topic" },
  { id: "university", label: "University / Institution" },
  { id: "experiment", label: "Experiment / Lab" },
  { id: "project", label: "Project / Technical" },
];

function parseAiContent(content: string): ParsedAiContent {
  try {
    const parsed = JSON.parse(content);
    if (parsed.report !== undefined) return parsed as ParsedAiContent;
  } catch {}
  return { report: content, code: content, docs: content, insights: content };
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function CodeOutput({ content }: { content: string }) {
  const codeMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
  const codeBlock = codeMatch
    ? codeMatch[1]
    : content.replace(/```[\w]*/g, "").replace(/```/g, "");
  const explanation = content.replace(/```[\s\S]*?```/g, "").trim();

  return (
    <div className="space-y-4">
      {explanation && <MarkdownContent content={explanation} />}
      <div className="relative my-3 overflow-hidden rounded-xl border border-blue-200/50 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20">
        <div className="flex items-center justify-between border-b border-blue-200/50 dark:border-blue-900/40 bg-blue-100/40 dark:bg-blue-900/20 px-3 py-2 text-xs text-muted-foreground">
          <span>Generated Code</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(codeBlock);
              toast.success("Code copied");
            }}
          >
            <Copy className="h-3 w-3" />
            Copy
          </Button>
        </div>
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-foreground">
          <code>{codeBlock}</code>
        </pre>
      </div>
    </div>
  );
}

function InsightsOutput({
  content,
  keywords,
}: {
  content: string;
  keywords?: string;
}) {
  const kws =
    keywords
      ?.split(",")
      .map((k) => k.trim())
      .filter(Boolean) ?? [];

  return (
    <div className="space-y-4">
      {kws.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Keywords
          </div>
          <div className="flex flex-wrap gap-2">
            {kws.map((k) => (
              <Badge key={k} variant="secondary">
                {k}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <MarkdownContent content={content} />
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors",
        active
          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
          : "text-muted-foreground hover:bg-blue-500/5 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default function MergedAppDashboard() {
  const { isAuthenticated, isGuest, user, guestSessionId, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [currentMode, setCurrentMode] = useState<Mode>("Report");
  const [currentTemplate, setCurrentTemplate] = useState<Template>("general");
  const [input, setInput] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<SidebarSection>("recent");
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  const [uploadedFile, setUploadedFile] = useState<{
    id: number;
    name: string;
    content: string;
  } | null>(null);
  const [lastKeywords, setLastKeywords] = useState<string[]>([]);
  const [lastSuggestions, setLastSuggestions] = useState<string[]>([]);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    setTranscript,
  } = useSpeechRecognition();

  useEffect(() => {
    if (!isAuthenticated && !isGuest) setLocation("/");
  }, [isAuthenticated, isGuest, setLocation]);

  useEffect(() => {
    if (transcript) {
      setInput((prev) => {
        const space = prev && !prev.endsWith(" ") ? " " : "";
        return prev + space + transcript;
      });
      setTranscript("");
    }
  }, [transcript, setTranscript]);

  const listParams = isGuest ? { guestSessionId } : undefined;

  const { data: chats = [] } = useListChats({
    params: listParams,
    query: { queryKey: getListChatsQueryKey(listParams) },
  });

  const { data: currentChat } = useGetChat(activeChatId as number, {
    query: {
      enabled: !!activeChatId,
      queryKey: getGetChatQueryKey(activeChatId as number),
    },
  });

  const { data: savedOutputs = [] } = useListSavedOutputs({
    params: listParams,
    query: { queryKey: getListSavedOutputsQueryKey(listParams) },
  });

  const { data: files = [] } = useListFiles({
    params: listParams,
    query: { queryKey: getListFilesQueryKey(listParams) },
  });

  const { data: sharedLinks = [] } = useListSharedLinks({
    params: listParams,
    query: { queryKey: getListSharedLinksQueryKey(listParams) },
  });

  const { data: stats } = useGetStats({
    params: listParams,
    query: { queryKey: getGetStatsQueryKey(listParams) },
  });

  const createChat = useCreateChat();
  const updateChat = useUpdateChat();
  const deleteChat = useDeleteChat();
  const toggleSaveChat = useToggleSaveChat();
  const generate = useGenerate();
  const uploadFile = useUploadFile();
  const createSavedOutput = useCreateSavedOutput();
  const deleteSavedOutput = useDeleteSavedOutput();
  const createShareLink = useCreateShareLink();

  useEffect(() => {
    if (!activeChatId && chats.length > 0) setActiveChatId(chats[0].id);
  }, [activeChatId, chats]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentChat?.messages, generate.isPending]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSavedOutputsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSharedLinksQueryKey() });
    if (activeChatId) {
      queryClient.invalidateQueries({
        queryKey: getGetChatQueryKey(activeChatId),
      });
    }
  }, [activeChatId, queryClient]);

  const handleNewChat = () => {
    createChat.mutate(
      {
        data: {
          title: "New Chat",
          mode: currentMode,
          guestSessionId: isGuest ? guestSessionId : undefined,
        } as any,
      },
      {
        onSuccess: (chat: any) => {
          setActiveChatId(chat.id);
          setActiveSection("recent");
          invalidateAll();
        },
        onError: () => toast.error("Failed to create chat"),
      },
    );
  };

  const handleSend = () => {
    if (!input.trim() && !uploadedFile) return;

    const promptToSend = input;
    setInput("");
    setUploadedFile(null);

    generate.mutate(
      {
        data: {
          prompt: promptToSend,
          mode: currentMode,
          template: currentTemplate,
          chatId: activeChatId,
          fileContent: uploadedFile?.content,
          guestSessionId: isGuest ? guestSessionId : undefined,
        },
      },
      {
        onSuccess: (res: any) => {
          setLastKeywords(res.keywords ?? []);
          setLastSuggestions(res.suggestions ?? []);

          let nextChatId = activeChatId;
          if (!activeChatId && res.chatId) {
            setActiveChatId(res.chatId);
            nextChatId = res.chatId;
          }

          if (nextChatId && res.title) {
            const existing = chats.find((chat: any) => chat.id === nextChatId);
            if (existing?.title === "New Chat") {
              updateChat.mutate(
                { id: nextChatId, data: { title: res.title.substring(0, 40) } },
                {
                  onSuccess: () =>
                    queryClient.invalidateQueries({
                      queryKey: getListChatsQueryKey(),
                    }),
                },
              );
            }
          }

          invalidateAll();
        },
        onError: () => toast.error("Failed to generate response"),
      },
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    uploadFile.mutate(
      { data: { file, chatId: activeChatId } as any },
      {
        onSuccess: (res: any) => {
          setUploadedFile({
            id: res.fileId,
            name: res.filename,
            content: res.content,
          });
          toast.success("File attached");
          queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
        },
        onError: () => toast.error("Failed to upload file"),
      },
    );
  };

  const handleDeleteChat = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteChat.mutate(
      { id },
      {
        onSuccess: () => {
          if (activeChatId === id) setActiveChatId(null);
          invalidateAll();
          toast.success("Chat deleted");
        },
        onError: () => toast.error("Failed to delete chat"),
      },
    );
  };

  const handleToggleSave = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    toggleSaveChat.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getListSavedOutputsQueryKey(),
          });
        },
      },
    );
  };

  const handleSaveOutput = (content: string) => {
    createSavedOutput.mutate(
      {
        data: {
          title: `Saved ${format(new Date(), "MMM d HH:mm")}`,
          content,
          mode: currentMode,
          chatId: activeChatId,
          guestSessionId: isGuest ? guestSessionId : undefined,
        } as any,
      },
      {
        onSuccess: () => {
          toast.success("Output saved");
          queryClient.invalidateQueries({
            queryKey: getListSavedOutputsQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        },
      },
    );
  };

  const handleDeleteSavedOutput = (id: number) => {
    deleteSavedOutput.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListSavedOutputsQueryKey(),
          });
          toast.success("Saved output deleted");
        },
      },
    );
  };

  const handleShareContent = (content: string) => {
    createShareLink.mutate(
      {
        data: {
          title: currentChat?.title ?? "Shared Output",
          content,
          mode: currentMode,
          chatId: activeChatId,
          guestSessionId: isGuest ? guestSessionId : undefined,
        } as any,
      },
      {
        onSuccess: (res: any) => {
          const fullUrl = `${window.location.origin}${import.meta.env.BASE_URL}share/${res.token}`;
          navigator.clipboard.writeText(fullUrl);
          toast.success("Share link copied");
          queryClient.invalidateQueries({
            queryKey: getListSharedLinksQueryKey(),
          });
        },
      },
    );
  };

  const handleRenameStart = (
    id: number,
    title: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setEditingTitleId(id);
    setEditingTitleValue(title);
  };

  const handleRenameSave = (id: number) => {
    if (!editingTitleValue.trim()) return;
    updateChat.mutate(
      { id, data: { title: editingTitleValue.trim() } },
      {
        onSuccess: () => {
          setEditingTitleId(null);
          queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
        },
      },
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const downloadText = (text: string, filename = "output.txt") => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyTemplate = (templateId: Template) => {
    setCurrentTemplate(templateId);
    setShowTemplateDropdown(false);
  };

  const renderMessageContent = (
    rawContent: string,
    modeForMessage?: string,
  ) => {
    const parsed = parseAiContent(rawContent);
    const mode = modeForMessage ?? currentMode;

    switch (mode) {
      case "Code":
        return <CodeOutput content={parsed.code} />;
      case "Documentation":
        return <MarkdownContent content={parsed.docs} />;
      case "Insight":
        return (
          <InsightsOutput
            content={parsed.insights}
            keywords={lastKeywords.join(", ")}
          />
        );
      default:
        return <MarkdownContent content={parsed.report} />;
    }
  };

  const renderSidebarContent = () => {
    if (activeSection === "templates") {
      return (
        <div className="p-3 space-y-1">
          <p className="text-xs text-muted-foreground px-2 pb-2 uppercase tracking-wider font-medium">
            Output Templates
          </p>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                currentTemplate === t.id
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                  : "text-muted-foreground hover:bg-blue-500/5 hover:text-foreground",
              )}
            >
              <Layout className="w-4 h-4 flex-shrink-0" />
              {t.label}
            </button>
          ))}
        </div>
      );
    }

    if (activeSection === "files") {
      return (
        <div className="p-3 space-y-1">
          <p className="text-xs text-muted-foreground px-2 pb-2 uppercase tracking-wider font-medium">
            Uploaded Files
          </p>
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center pt-4">
              No files uploaded yet.
            </p>
          ) : (
            files.map((file: any) => (
              <div
                key={file.id}
                className="px-3 py-2 rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/40 dark:border-blue-900/40"
              >
                <p className="text-xs font-medium truncate">
                  {file.filename ?? file.fileName}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(file.fileType ?? "file").toUpperCase?.() ?? file.fileType}
                </p>
              </div>
            ))
          )}
        </div>
      );
    }

    if (activeSection === "shared") {
      return (
        <div className="p-3 space-y-1">
          <p className="text-xs text-muted-foreground px-2 pb-2 uppercase tracking-wider font-medium">
            Shared Links
          </p>
          {sharedLinks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center pt-4">
              No shared links yet.
            </p>
          ) : (
            sharedLinks.map((link: any) => (
              <div
                key={link.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/40 dark:border-blue-900/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{link.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(link.createdAt), "MMM d")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    const url = `${window.location.origin}${import.meta.env.BASE_URL}share/${link.token}`;
                    navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      );
    }

    if (activeSection === "profile") {
      return (
        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Profile
            </p>
            <div className="bg-blue-50/60 dark:bg-blue-950/20 rounded-lg p-3 space-y-1 border border-blue-200/40 dark:border-blue-900/40">
              <p className="font-medium text-sm truncate">
                {user?.fullName ?? "Guest User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email ?? "Browsing as guest"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAuthenticated ? "Registered account" : "Guest session"}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => {
              logout();
              setLocation("/");
            }}
          >
            <LogOut className="w-4 h-4" />
            {isAuthenticated ? "Sign out" : "Exit guest"}
          </Button>
        </div>
      );
    }

    const list =
      activeSection === "saved" ? chats.filter((c: any) => c.isSaved) : chats;

    return (
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-0.5 pb-4 pt-1">
          {list.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground pt-8 px-4">
              {activeSection === "saved"
                ? "No saved chats yet."
                : "No chats yet. Start a new chat."}
            </div>
          ) : (
            list.map((chat: any) => (
              <div key={chat.id} className="group relative">
                {editingTitleId === chat.id ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <Input
                      value={editingTitleValue}
                      onChange={(e) => setEditingTitleValue(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSave(chat.id);
                        if (e.key === "Escape") setEditingTitleId(null);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => handleRenameSave(chat.id)}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => setEditingTitleId(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveChatId(chat.id);
                      setActiveSection("recent");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setActiveChatId(chat.id);
                        setActiveSection("recent");
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors cursor-pointer",
                      activeChatId === chat.id
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                        : "hover:bg-blue-500/5 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
                      <span className="truncate text-xs">{chat.title}</span>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 flex-shrink-0">
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:text-amber-500 hover:bg-blue-500/10 transition-colors"
                        onClick={(e) => handleToggleSave(chat.id, e)}
                        title={chat.isSaved ? "Unsave" : "Save"}
                      >
                        {chat.isSaved ? (
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        ) : (
                          <StarOff className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:text-primary hover:bg-blue-500/10 transition-colors"
                        onClick={(e) =>
                          handleRenameStart(chat.id, chat.title, e)
                        }
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:text-destructive hover:bg-blue-500/10 transition-colors"
                        onClick={(e) => handleDeleteChat(chat.id, e)}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden text-foreground bg-gradient-to-br from-blue-50 via-background to-blue-100/60 dark:from-slate-950 dark:via-background dark:to-blue-950/30">
      {isSidebarOpen && (
        <div className="w-64 flex-shrink-0 border-r border-blue-200/40 dark:border-blue-900/40 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-blue-200/40 dark:border-blue-900/40">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center shadow-sm">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <h1 className="font-bold text-l tracking-tight text-blue-700 dark:text-blue-300">
                AutoScribe AI
              </h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsSidebarOpen(false)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>

          <div className="p-3">
            <Button
              className="w-full justify-start gap-2 text-sm h-9 bg-blue-600 hover:bg-blue-700 "
              onClick={handleNewChat}
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
          </div>

          <div className="px-2 space-y-0.5">
            <SidebarItem
              icon={<History className="w-4 h-4" />}
              label="Recent"
              active={activeSection === "recent"}
              onClick={() => setActiveSection("recent")}
            />
            <SidebarItem
              icon={<Star className="w-4 h-4" />}
              label="Saved"
              active={activeSection === "saved"}
              onClick={() => setActiveSection("saved")}
            />
            <SidebarItem
              icon={<FolderOpen className="w-4 h-4" />}
              label="Files"
              active={activeSection === "files"}
              onClick={() => setActiveSection("files")}
            />
            <SidebarItem
              icon={<Layout className="w-4 h-4" />}
              label="Templates"
              active={activeSection === "templates"}
              onClick={() => setActiveSection("templates")}
            />
            <SidebarItem
              icon={<Link className="w-4 h-4" />}
              label="Shared"
              active={activeSection === "shared"}
              onClick={() => setActiveSection("shared")}
            />
          </div>

          <Separator className="my-2 bg-blue-200/40 dark:bg-blue-900/40" />

          <div className="flex-1 overflow-hidden flex flex-col">
            {renderSidebarContent()}
          </div>

          {activeSection === "recent" && (
            <div className="border-t border-blue-200/40 dark:border-blue-900/40 p-3">
              <div className="rounded-md bg-blue-50/70 dark:bg-blue-950/20 p-3 border border-blue-200/40 dark:border-blue-900/40 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Workspace Summary
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-medium">{currentMode}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Template</span>
                  <span className="font-medium">
                    {TEMPLATES.find((t) => t.id === currentTemplate)?.label}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium">
                    {generate.isPending ? "Generating..." : "Ready"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-blue-200/40 dark:border-blue-900/40 p-2">
            <button
              onClick={() => setActiveSection("profile")}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                activeSection === "profile"
                  ? "bg-blue-500/10"
                  : "hover:bg-blue-500/5",
              )}
            >
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                {(user?.fullName?.[0] ?? "G").toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {user?.fullName ?? (isGuest ? "Guest User" : "Profile")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email ?? (isGuest ? "Guest session" : "Open profile")}
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-blue-200/40 dark:border-blue-900/40 bg-white/50 dark:bg-slate-950/40 backdrop-blur-md flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {!isSidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            <span className="text-sm font-semibold truncate">
              {currentChat?.title ?? "AutoScribe Workspace"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {activeChatId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground"
                onClick={() => {
                  const assistantMessage = [...(currentChat?.messages ?? [])]
                    .reverse()
                    .find((m: any) => m.role !== "user");
                  if (assistantMessage) {
                    handleShareContent(assistantMessage.content);
                  } else {
                    toast.error("No generated content to share");
                  }
                }}
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6">
          {!currentChat?.messages?.length && !generate.isPending ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-3xl mx-auto space-y-5">
              {" "}
              <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center mb-2 border border-blue-200/40 dark:border-blue-900/40">
                <MessageSquare className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                How can I help you today?
              </h2>
              <p className="text-muted-foreground">
                {isAuthenticated
                  ? `Welcome back, ${user?.fullName}.`
                  : "Browsing as guest."}{" "}
                Select a mode and start typing.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-xs mt-2">
                {MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setCurrentMode(mode.id)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all bg-white/70 dark:bg-slate-950/40 backdrop-blur-sm",
                      currentMode === mode.id
                        ? `border-blue-300 dark:border-blue-800 ${mode.accent} ring-1 ring-inset`
                        : "border-blue-200/40 dark:border-blue-900/40 text-muted-foreground hover:bg-blue-50 dark:hover:bg-blue-950/20",
                    )}
                  >
                    <span className={mode.color}>{mode.icon}</span>
                    {mode.label}
                  </button>
                ))}
              </div>
              {lastSuggestions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {lastSuggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => setInput(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 pb-4">
              {currentChat?.messages?.map((message: any, index: number) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id ?? index}
                    className={cn(
                      "flex gap-3",
                      isUser ? "flex-row-reverse" : "",
                    )}
                  >
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border",
                        isUser
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-blue-50 dark:bg-blue-950/30 border-blue-200/40 dark:border-blue-900/40 text-blue-600 dark:text-blue-400",
                      )}
                    >
                      {isUser ? (user?.fullName?.[0] ?? "U") : "AI"}
                    </div>

                    <div
                      className={cn(
                        "flex flex-col gap-1.5 min-w-0 max-w-[88%]",
                        isUser ? "items-end" : "items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "px-4 py-3 rounded-2xl text-sm leading-relaxed backdrop-blur-sm",
                          isUser
                            ? "bg-blue-600 text-white rounded-tr-sm shadow-sm"
                            : "bg-white/80 dark:bg-slate-950/50 border border-blue-200/40 dark:border-blue-900/40 text-card-foreground rounded-tl-sm",
                        )}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">
                            {message.content}
                          </p>
                        ) : (
                          renderMessageContent(message.content, message.mode)
                        )}
                      </div>

                      {!isUser && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => copyToClipboard(message.content)}
                            title="Copy"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              downloadText(
                                message.content,
                                `autoscribe-${currentMode.toLowerCase()}-${Date.now()}.md`,
                              )
                            }
                            title="Download"
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleSaveOutput(message.content)}
                            title="Save"
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleShareContent(message.content)}
                            title="Share"
                          >
                            <Share2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {generate.isPending && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border bg-blue-600/10 border-blue-300/40 dark:border-blue-900/40 text-blue-600 dark:text-blue-400">
                    AI
                  </div>
                  <div className="flex flex-col gap-1.5 items-start max-w-[88%]">
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm bg-white/80 dark:bg-slate-950/50 border border-blue-200/40 dark:border-blue-900/40 text-card-foreground min-w-[120px] backdrop-blur-sm">
                      <div className="flex items-center gap-1.5 py-0.5">
                        <span className="text-xs text-muted-foreground mr-1">
                          Thinking
                        </span>
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="w-1.5 h-1.5 bg-blue-500/70 rounded-full animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="p-4 bg-white/40 dark:bg-slate-950/30 backdrop-blur-md border-t border-blue-200/40 dark:border-blue-900/40 flex-shrink-0">
          <div className="max-w-3xl mx-auto space-y-2">
            {uploadedFile && (
              <div className="mb-2 flex items-center justify-between rounded-lg border border-blue-200/40 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{uploadedFile.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setUploadedFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex items-center justify-start">
              <div className="relative">
                <button
                  onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/40"
                >
                  <Layout className="w-3 h-3" />
                  {TEMPLATES.find((t) => t.id === currentTemplate)?.label ??
                    "Template"}
                  <ChevronDown className="w-3 h-3" />
                </button>

                {showTemplateDropdown && (
                  <div className="absolute bottom-full mb-1 left-0 bg-popover border border-blue-200/50 dark:border-blue-900/40 rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors",
                          currentTemplate === t.id
                            ? "text-blue-600 dark:text-blue-400 font-medium"
                            : "text-foreground",
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-900/40 bg-white/80 dark:bg-slate-950/50 shadow-sm backdrop-blur-sm focus-within:ring-1 focus-within:ring-blue-400/40 focus-within:border-blue-400/50 transition-all">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask AutoScribe to generate a ${MODES.find((m) => m.id === currentMode)?.label.toLowerCase()}...`}
                className="min-h-[56px] max-h-52 resize-none border-0 focus-visible:ring-0 px-3 pt-3 pb-11 bg-transparent text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />

              <div className="absolute bottom-2 left-2 flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 text-muted-foreground hover:text-foreground",
                    isListening && "text-blue-600 dark:text-blue-400",
                  )}
                  onClick={() =>
                    isListening ? stopListening() : startListening()
                  }
                  title={isListening ? "Stop recording" : "Start recording"}
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="absolute bottom-2 right-2">
                <Button
                  onClick={handleSend}
                  disabled={
                    generate.isPending || (!input.trim() && !uploadedFile)
                  }
                  size="icon"
                  className="h-7 w-7 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <p className="text-center text-[10px] text-muted-foreground">
              AutoScribe can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
