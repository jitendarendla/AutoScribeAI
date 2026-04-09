import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useListChats, useCreateChat, useGetChat, useUpdateChat, useDeleteChat,
  useGenerate, useUploadFile, useListSavedOutputs, useCreateSavedOutput,
  useDeleteSavedOutput, useCreateShareLink, useGetStats, useToggleSaveChat,
  useListFiles, useListSharedLinks,
  getListChatsQueryKey, getListSavedOutputsQueryKey, getGetStatsQueryKey,
  getGetChatQueryKey, getListFilesQueryKey, getListSharedLinksQueryKey,
} from "@workspace/api-client-react";
import {
  Menu, Plus, MessageSquare, Save, Moon, Sun,
  Trash2, Share2, Copy, Download, Send, Paperclip, Mic,
  MicOff, Sparkles, X, ChevronDown, Check, Loader2, FileText,
  Star, StarOff, Link, User, LayoutTemplate, Files, BookMarked,
  ChevronRight, LogOut, Shield,
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { toast } from "sonner";

const MODES = ["Report", "Code", "Documentation", "Insight"];
const TEMPLATES = [
  { value: "general", label: "General Topic" },
  { value: "university", label: "University / Institution" },
  { value: "experiment", label: "Experiment / Lab" },
  { value: "project", label: "Project / Technical Concept" },
];

type SidebarSection = "chats" | "saved" | "files" | "templates" | "shared" | "profile";

interface ParsedAiContent {
  report: string;
  code: string;
  docs: string;
  insights: string;
}

function parseAiContent(content: string): ParsedAiContent {
  try {
    const parsed = JSON.parse(content);
    if (parsed.report !== undefined) return parsed as ParsedAiContent;
  } catch {}
  return { report: content, code: content, docs: content, insights: content };
}

function StructuredMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm prose-headings:text-foreground prose-headings:font-semibold prose-h2:text-base prose-h3:text-sm prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground prose-strong:text-foreground max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function CodeOutput({ content }: { content: string }) {
  const codeMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
  const codeBlock = codeMatch ? codeMatch[1] : content.replace(/```[\w]*/g, "").replace(/```/g, "");
  const explanation = content.replace(/```[\s\S]*?```/g, "").trim();
  return (
    <div className="space-y-4">
      {explanation && (
        <div className="text-sm text-muted-foreground leading-relaxed">
          <StructuredMarkdown content={explanation} />
        </div>
      )}
      <div className="bg-black/60 rounded-lg border border-white/10 overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <span className="text-xs text-muted-foreground font-mono">Generated Code</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => { navigator.clipboard.writeText(codeBlock); toast.success("Code copied"); }}
          >
            <Copy className="w-3 h-3" /> Copy
          </Button>
        </div>
        <pre className="p-4 font-mono text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
          <code>{codeBlock}</code>
        </pre>
      </div>
    </div>
  );
}

function InsightsOutput({ content, keywords }: { content: string; keywords?: string }) {
  const kws = keywords?.split(",").map(k => k.trim()).filter(Boolean) ?? [];
  return (
    <div className="space-y-4">
      {kws.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Keywords</div>
          <div className="flex flex-wrap gap-2">
            {kws.map(k => (
              <Badge key={k} variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                {k}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="prose prose-invert prose-sm max-w-none">
        <StructuredMarkdown content={content} />
      </div>
    </div>
  );
}

export default function AppDashboard() {
  const { isAuthenticated, isGuest, user, guestSessionId, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("chats");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [currentMode, setCurrentMode] = useState("Report");
  const [currentTemplate, setCurrentTemplate] = useState("general");
  const [inputPrompt, setInputPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<{ id: number; name: string; content: string } | null>(null);
  const [lastKeywords, setLastKeywords] = useState<string[]>([]);
  const [lastSuggestions, setLastSuggestions] = useState<string[]>([]);
  const [editingChatId, setEditingChatId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isListening, transcript, startListening, stopListening, setTranscript } = useSpeechRecognition();

  useEffect(() => {
    if (!isAuthenticated && !isGuest) setLocation("/");
  }, [isAuthenticated, isGuest, setLocation]);

  useEffect(() => {
    if (transcript) {
      setInputPrompt(prev => {
        const space = prev && !prev.endsWith(" ") ? " " : "";
        return prev + space + transcript;
      });
      setTranscript("");
    }
  }, [transcript, setTranscript]);

  const commonQueryParams = isGuest ? { guestSessionId } : {};

  const { data: chats = [] } = useListChats({
    params: isGuest ? { guestSessionId } : undefined,
    query: { queryKey: getListChatsQueryKey(isGuest ? { guestSessionId } : undefined) }
  });
  const { data: savedOutputs = [] } = useListSavedOutputs({
    params: isGuest ? { guestSessionId } : undefined,
    query: { queryKey: getListSavedOutputsQueryKey(isGuest ? { guestSessionId } : undefined) }
  });
  const { data: stats } = useGetStats({
    params: isGuest ? { guestSessionId } : undefined,
    query: { queryKey: getGetStatsQueryKey(isGuest ? { guestSessionId } : undefined) }
  });
  const { data: files = [] } = useListFiles({
    params: isGuest ? { guestSessionId } : undefined,
    query: { queryKey: getListFilesQueryKey(isGuest ? { guestSessionId } : undefined) }
  });
  const { data: sharedLinks = [] } = useListSharedLinks({
    params: isGuest ? { guestSessionId } : undefined,
    query: { queryKey: getListSharedLinksQueryKey(isGuest ? { guestSessionId } : undefined) }
  });
  const { data: currentChat, isLoading: isChatLoading } = useGetChat(selectedChatId as number, {
    query: {
      enabled: !!selectedChatId,
      queryKey: getGetChatQueryKey(selectedChatId as number)
    }
  });

  const createChat = useCreateChat();
  const updateChat = useUpdateChat();
  const deleteChat = useDeleteChat();
  const toggleSave = useToggleSaveChat();
  const generate = useGenerate();
  const uploadFile = useUploadFile();
  const createSavedOutput = useCreateSavedOutput();
  const deleteSavedOutput = useDeleteSavedOutput();
  const createShareLink = useCreateShareLink();

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [currentChat?.messages, generate.isPending]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
    if (selectedChatId) queryClient.invalidateQueries({ queryKey: getGetChatQueryKey(selectedChatId) });
  };

  const handleNewChat = () => {
    createChat.mutate({ data: { title: "New Chat", mode: currentMode } }, {
      onSuccess: (chat) => {
        setSelectedChatId(chat.id);
        setSidebarSection("chats");
        queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
      }
    });
  };

  const handleSend = (overridePrompt?: string) => {
    const promptToSend = overridePrompt ?? inputPrompt;
    if (!promptToSend.trim() && !uploadedFile) return;

    const body = {
      prompt: promptToSend,
      mode: currentMode,
      template: currentTemplate,
      chatId: selectedChatId,
      fileContent: uploadedFile?.content,
      guestSessionId: isGuest ? guestSessionId : undefined,
    };

    setInputPrompt("");
    setUploadedFile(null);

    generate.mutate({ data: body }, {
      onSuccess: (res) => {
        setLastKeywords(res.keywords ?? []);
        setLastSuggestions(res.suggestions ?? []);
        let newChatId = selectedChatId;
        if (!selectedChatId && res.chatId) {
          setSelectedChatId(res.chatId);
          newChatId = res.chatId;
        }
        if (newChatId && res.title) {
          const chat = chats.find(c => c.id === newChatId);
          if (chat?.title === "New Chat") {
            updateChat.mutate({ id: newChatId, data: { title: res.title.substring(0, 40) } }, {
              onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() })
            });
          }
        }
        invalidateAll();
      }
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFile.mutate({ data: { file, chatId: selectedChatId } }, {
      onSuccess: (res) => {
        setUploadedFile({ id: res.fileId, name: res.filename, content: res.content });
        toast.success("File attached");
        queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
      },
      onError: () => toast.error("Failed to upload file"),
    });
  };

  const handleSaveOutput = (content: string) => {
    createSavedOutput.mutate({
      data: {
        title: "Saved " + format(new Date(), "MMM d HH:mm"),
        content,
        mode: currentMode,
        chatId: selectedChatId,
        guestSessionId: isGuest ? guestSessionId : undefined,
      }
    }, {
      onSuccess: () => {
        toast.success("Output saved!");
        queryClient.invalidateQueries({ queryKey: getListSavedOutputsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      }
    });
  };

  const handleShare = (content: string) => {
    createShareLink.mutate({
      data: {
        title: currentChat?.title ?? "Shared Output",
        content,
        mode: currentMode,
        chatId: selectedChatId,
        guestSessionId: isGuest ? guestSessionId : undefined,
      }
    }, {
      onSuccess: (res) => {
        const fullUrl = window.location.origin + import.meta.env.BASE_URL + "share/" + res.token;
        navigator.clipboard.writeText(fullUrl);
        toast.success("Share link copied to clipboard!");
        queryClient.invalidateQueries({ queryKey: getListSharedLinksQueryKey() });
      }
    });
  };

  const handleToggleSave = (chatId: number) => {
    toggleSave.mutate({ id: chatId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSavedOutputsQueryKey() });
      }
    });
  };

  const handleDownloadTxt = (content: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "output.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const startEditChat = (chatId: number, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chatId);
    setEditingTitle(title);
  };

  const saveEditChat = () => {
    if (!editingChatId || !editingTitle.trim()) return;
    updateChat.mutate({ id: editingChatId, data: { title: editingTitle.trim() } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
        setEditingChatId(null);
      }
    });
  };

  const savedChats = chats.filter(c => c.isSaved);

  const navItems: { key: SidebarSection; icon: React.ElementType; label: string }[] = [
    { key: "chats", icon: MessageSquare, label: "Chats" },
    { key: "saved", icon: BookMarked, label: "Saved" },
    { key: "files", icon: Files, label: "Files" },
    { key: "templates", icon: LayoutTemplate, label: "Templates" },
    { key: "shared", icon: Link, label: "Shared" },
    { key: "profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30 text-foreground">

      {/* LEFT SIDEBAR */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full border-r border-white/10 bg-black/20 backdrop-blur-xl flex flex-col z-20 flex-shrink-0"
          >
            {/* Logo */}
            <div className="p-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-5 h-5" />
                <span className="font-bold text-foreground">AutoScribe AI+</span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full md:hidden" onClick={() => setIsSidebarOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* New Chat */}
            <div className="p-4">
              <Button onClick={handleNewChat} className="w-full justify-start gap-2 shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4" /> New Chat
              </Button>
            </div>

            {/* Nav tabs */}
            <div className="px-3 grid grid-cols-3 gap-1 mb-2">
              {navItems.slice(0, 6).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setSidebarSection(key)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs transition-colors",
                    sidebarSection === key
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <Separator className="bg-white/10 mx-4" />

            {/* Section Content */}
            <ScrollArea className="flex-1 px-3 py-2">
              {/* CHATS */}
              {sidebarSection === "chats" && (
                <div className="space-y-1">
                  {chats.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">No chats yet. Start a new one!</div>
                  )}
                  {chats.map(chat => (
                    <div
                      key={chat.id}
                      onClick={() => setSelectedChatId(chat.id)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer group text-sm transition-colors",
                        selectedChatId === chat.id ? "bg-primary/20 text-primary" : "hover:bg-white/5"
                      )}
                    >
                      {editingChatId === chat.id ? (
                        <input
                          autoFocus
                          className="flex-1 bg-transparent border-b border-primary/50 text-sm outline-none mr-2"
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onBlur={saveEditChat}
                          onKeyDown={e => { if (e.key === "Enter") saveEditChat(); if (e.key === "Escape") setEditingChatId(null); }}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <div className="flex items-center gap-2 truncate flex-1">
                          <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate" onDoubleClick={e => startEditChat(chat.id, chat.title, e)}>{chat.title}</span>
                        </div>
                      )}
                      <div className="flex items-center opacity-0 group-hover:opacity-100 gap-0.5 flex-shrink-0">
                        <Button
                          variant="ghost" size="icon" className={cn("h-6 w-6", chat.isSaved ? "text-yellow-400 opacity-100" : "")}
                          onClick={e => { e.stopPropagation(); handleToggleSave(chat.id); }}
                        >
                          {chat.isSaved ? <Star className="w-3 h-3 fill-current" /> : <StarOff className="w-3 h-3" />}
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
                          onClick={e => { e.stopPropagation(); deleteChat.mutate({ id: chat.id }, { onSuccess: () => { if (selectedChatId === chat.id) setSelectedChatId(null); queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() }); } }); }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SAVED */}
              {sidebarSection === "saved" && (
                <div className="space-y-1">
                  {savedChats.length === 0 && savedOutputs.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">No saved items yet. Star a chat to save it.</div>
                  )}
                  {savedChats.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Starred Chats</div>
                      {savedChats.map(chat => (
                        <div
                          key={chat.id}
                          onClick={() => { setSelectedChatId(chat.id); setSidebarSection("chats"); }}
                          className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-white/5 text-sm"
                        >
                          <Star className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                          <span className="truncate">{chat.title}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {savedOutputs.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2">Saved Outputs</div>
                      {savedOutputs.map(output => (
                        <div key={output.id} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-white/5 cursor-pointer text-sm group">
                          <div className="flex items-center gap-2 truncate">
                            <Save className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{output.title}</span>
                          </div>
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                            onClick={e => { e.stopPropagation(); deleteSavedOutput.mutate({ id: output.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSavedOutputsQueryKey() }) }); }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* FILES */}
              {sidebarSection === "files" && (
                <div className="space-y-1">
                  {files.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">No files uploaded yet. Use the paperclip icon to attach a file.</div>
                  )}
                  {files.map(file => (
                    <div key={file.id} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/5 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="truncate flex-1">
                        <div className="truncate text-sm">{file.filename}</div>
                        <div className="text-xs text-muted-foreground">{file.fileType.toUpperCase()} · {format(new Date(file.createdAt), "MMM d")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TEMPLATES */}
              {sidebarSection === "templates" && (
                <div className="space-y-2">
                  <div className="px-2 py-1 text-xs text-muted-foreground">Choose a template to structure your report output.</div>
                  {TEMPLATES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => { setCurrentTemplate(t.value); toast.success(`Template: ${t.label}`); }}
                      className={cn(
                        "w-full text-left px-3 py-3 rounded-lg text-sm transition-colors border",
                        currentTemplate === t.value
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10"
                      )}
                    >
                      <div className="font-medium">{t.label}</div>
                      {currentTemplate === t.value && (
                        <div className="text-xs mt-1 opacity-70 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Active template
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* SHARED LINKS */}
              {sidebarSection === "shared" && (
                <div className="space-y-1">
                  {sharedLinks.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">No shared links yet. Generate one from the output panel.</div>
                  )}
                  {sharedLinks.map(link => (
                    <div key={link.id} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/5 text-sm group">
                      <Link className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 truncate">
                        <div className="truncate text-sm">{link.title}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(link.createdAt), "MMM d")}</div>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={() => {
                          const url = window.location.origin + import.meta.env.BASE_URL + "share/" + link.token;
                          navigator.clipboard.writeText(url);
                          toast.success("Link copied!");
                        }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* PROFILE */}
              {sidebarSection === "profile" && (
                <div className="space-y-3 p-2">
                  {isGuest ? (
                    <div className="text-center space-y-3 py-4">
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto">
                        <User className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">Guest User</div>
                        <div className="text-xs text-muted-foreground">Temporary session</div>
                      </div>
                      <Button className="w-full" onClick={() => { logout(); setLocation("/"); }}>
                        Sign In / Sign Up
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="truncate">
                          <div className="font-medium text-sm truncate">{user?.fullName ?? "User"}</div>
                          <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between px-3 py-2 rounded-md bg-white/5 text-sm">
                          <span className="text-muted-foreground">Account type</span>
                          <Badge variant="secondary" className="text-xs">Registered</Badge>
                        </div>
                        {user?.createdAt && (
                          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-white/5 text-sm">
                            <span className="text-muted-foreground">Member since</span>
                            <span className="text-xs">{format(new Date(user.createdAt), "MMM yyyy")}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        className="w-full border-white/10 hover:border-destructive/50 hover:text-destructive gap-2"
                        onClick={() => { logout(); setLocation("/"); }}
                      >
                        <LogOut className="w-4 h-4" /> Sign Out
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

           
            {/* Theme toggle + collapse */}
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <div className="flex items-center gap-2">
                {isGuest && <Badge variant="outline" className="text-xs border-yellow-400/30 text-yellow-400">Guest</Badge>}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsSidebarOpen(false)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CENTER PANEL */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-br from-background to-background/50 min-w-0">
        <header className="h-14 border-b border-white/10 flex items-center px-4 gap-3 bg-black/10 backdrop-blur-md z-10">
          {!isSidebarOpen && (
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 bg-white/5 border-white/10 h-8">
                {currentMode} <ChevronDown className="w-4 h-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48 bg-card/95 backdrop-blur-xl border-white/10">
              {MODES.map(mode => (
                <DropdownMenuItem key={mode} onClick={() => setCurrentMode(mode)} className="justify-between">
                  {mode}
                  {currentMode === mode && <Check className="w-4 h-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 bg-white/5 border-white/10 h-8 text-xs">
                <LayoutTemplate className="w-3 h-3" />
                {TEMPLATES.find(t => t.value === currentTemplate)?.label ?? "Template"}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-card/95 backdrop-blur-xl border-white/10">
              {TEMPLATES.map(t => (
                <DropdownMenuItem key={t.value} onClick={() => setCurrentTemplate(t.value)} className="justify-between">
                  <span>{t.label}</span>
                  {currentTemplate === t.value && <Check className="w-4 h-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {currentChat && (
            <div className="text-sm font-medium text-muted-foreground hidden md:block truncate max-w-[200px]">
              {currentChat.title}
            </div>
          )}
        </header>

        <ScrollArea className="flex-1 p-4 md:p-8">
          <div className="max-w-4xl mx-auto space-y-6 pb-36">
            {isChatLoading && (
              <div className="flex justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {!isChatLoading && !selectedChatId && !generate.isPending && (
              <div className="h-[50vh] flex flex-col items-center justify-center text-center opacity-50">
                <Sparkles className="w-12 h-12 mb-4" />
                <h2 className="text-2xl font-semibold mb-2">What shall we build today?</h2>
                <p className="max-w-md text-muted-foreground">
                  Select a mode and template above, then type your prompt below. AutoScribe will generate structured, comprehensive output.
                </p>
              </div>
            )}

            {!isChatLoading && selectedChatId && currentChat?.messages.length === 0 && !generate.isPending && (
              <div className="h-[50vh] flex flex-col items-center justify-center text-center opacity-50">
                <MessageSquare className="w-12 h-12 mb-4" />
                <h2 className="text-xl font-semibold mb-2">New chat started</h2>
                <p className="text-muted-foreground">Type your prompt below to begin.</p>
              </div>
            )}

            {currentChat?.messages.map((msg) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
                className={cn("flex gap-4 w-full", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "ai" && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                )}

                <div className={cn(
                  "max-w-[92%] rounded-2xl p-5 shadow-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-white/5 border border-white/10 rounded-tl-sm backdrop-blur-sm"
                )}>
                  {msg.role === "ai" ? (
                    <AiMessageContent
                      content={msg.content}
                      keywords={msg.keywords ?? ""}
                      mode={msg.mode}
                      onSave={handleSaveOutput}
                      onShare={handleShare}
                      onDownload={handleDownloadTxt}
                    />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </motion.div>
            ))}

            {generate.isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 w-full justify-start">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm p-4 flex items-center gap-3 backdrop-blur-sm">
                  <div className="flex space-x-1.5">
                    {[0, 0.2, 0.4].map(delay => (
                      <motion.div
                        key={delay}
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 1, delay }}
                        className="w-2 h-2 bg-primary rounded-full"
                      />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">Synthesizing all outputs...</span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

              {/* INPUT AREA */}
              <div className="p-4 bg-gradient-to-t from-background via-background/95 to-transparent absolute bottom-0 left-0 right-0 z-10">
                <div className="max-w-4xl mx-auto relative">

                  {uploadedFile && (
                    <div className="absolute -top-10 left-2 flex items-center gap-2 bg-secondary/20 border px-3 py-1.5 rounded-full text-xs">
                      <FileText className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{uploadedFile.name}</span>
                      <button onClick={() => setUploadedFile(null)}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center bg-black/60 border border-white/10 rounded-2xl p-1">

                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileUpload}
                    />

                    <Button onClick={() => fileInputRef.current?.click()}>
                      <Paperclip className="w-4 h-4" />
                    </Button>

                    <Input
                      value={inputPrompt}
                      onChange={e => setInputPrompt(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type your prompt..."
                      className="flex-1 bg-transparent border-0"
                    />

                    <Button onClick={() => handleSend()}>
                      {generate.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Send
                        </>
                      )}
                    </Button>

                  </div>
                </div>
              </div>

              {/* CLOSE MAIN + ROOT */}
              </div>
              </div>

              );
              }