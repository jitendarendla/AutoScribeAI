import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListChats, useCreateChat, useGetChat, useUpdateChat, useDeleteChat,
  useGenerate, useUploadFile, useListSavedOutputs, useCreateSavedOutput,
  useDeleteSavedOutput, useCreateShareLink, useGetStats,
  getListChatsQueryKey, getListSavedOutputsQueryKey, getGetStatsQueryKey,
  getGetChatQueryKey
} from "@workspace/api-client-react";
import { 
  Menu, Plus, MessageSquare, Save, Moon, Sun, 
  Trash2, Share2, Copy, Download, Send, Paperclip, Mic, 
  MicOff, Sparkles, X, ChevronDown, Check, Loader2, FileText
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

export default function AppDashboard() {
  const { isAuthenticated, isGuest, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [currentMode, setCurrentMode] = useState("Report");
  const [inputPrompt, setInputPrompt] = useState("");
  const [uploadedFile, setUploadedFile] = useState<{ id: number; name: string; content: string } | null>(null);
  
  const [lastKeywords, setLastKeywords] = useState<string[]>([]);
  const [lastSuggestions, setLastSuggestions] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isListening, transcript, startListening, stopListening, setTranscript } = useSpeechRecognition();

  // Redirect if not auth
  useEffect(() => {
    if (!isAuthenticated && !isGuest) {
      setLocation("/");
    }
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

  const { data: chats = [] } = useListChats({ query: { queryKey: getListChatsQueryKey() } });
  const { data: savedOutputs = [] } = useListSavedOutputs({ query: { queryKey: getListSavedOutputsQueryKey() } });
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey() } });
  
  const { data: currentChat, isLoading: isChatLoading } = useGetChat(selectedChatId as number, { 
    query: { 
      enabled: !!selectedChatId,
      queryKey: getGetChatQueryKey(selectedChatId as number)
    } 
  });

  const createChat = useCreateChat();
  const updateChat = useUpdateChat();
  const deleteChat = useDeleteChat();
  const generate = useGenerate();
  const uploadFile = useUploadFile();
  const createSavedOutput = useCreateSavedOutput();
  const deleteSavedOutput = useDeleteSavedOutput();
  const createShareLink = useCreateShareLink();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat?.messages, generate.isPending]);

  const handleNewChat = () => {
    createChat.mutate({ data: { title: "New Chat", mode: currentMode } }, {
      onSuccess: (chat) => {
        setSelectedChatId(chat.id);
        queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
      }
    });
  };

  const handleSend = () => {
    if (!inputPrompt.trim() && !uploadedFile) return;

    const body = {
      prompt: inputPrompt,
      mode: currentMode,
      chatId: selectedChatId,
      fileContent: uploadedFile?.content
    };

    const currentPrompt = inputPrompt;

    setInputPrompt("");
    setUploadedFile(null);

    generate.mutate({ data: body }, {
      onSuccess: (res) => {
        setLastKeywords(res.keywords || []);
        setLastSuggestions(res.suggestions || []);
        
        let newChatId = selectedChatId;
        if (!selectedChatId && res.chatId) {
          setSelectedChatId(res.chatId);
          newChatId = res.chatId;
        }

        // Auto rename chat if it's new
        const chat = chats.find(c => c.id === newChatId);
        if (chat && chat.title === "New Chat" && currentPrompt) {
          updateChat.mutate({
            id: newChatId as number,
            data: { title: currentPrompt.substring(0, 30) + (currentPrompt.length > 30 ? "..." : "") }
          }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() })
          });
        }
        
        queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        if (newChatId) {
          queryClient.invalidateQueries({ queryKey: getGetChatQueryKey(newChatId) });
        }
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
      },
      onError: () => {
        toast.error("Failed to upload file");
      }
    });
  };

  const handleSaveOutput = (content: string) => {
    createSavedOutput.mutate({
      data: { title: "Saved Snippet " + format(new Date(), "MMM d"), content, mode: currentMode, chatId: selectedChatId }
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
      data: { title: "Shared Output", content, mode: currentMode }
    }, {
      onSuccess: (res) => {
        const fullUrl = window.location.origin + import.meta.env.BASE_URL + "share/" + res.token;
        navigator.clipboard.writeText(fullUrl);
        toast.success("Share link copied to clipboard!");
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
            <div className="p-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="w-5 h-5" />
                <span className="font-bold text-foreground">AutoScribe AI+</span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full md:hidden" onClick={() => setIsSidebarOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4">
              <Button onClick={handleNewChat} className="w-full justify-start gap-2 shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4" />
                New Chat
              </Button>
            </div>

            <ScrollArea className="flex-1 px-2">
              <div className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Chats
              </div>
              <div className="space-y-1">
                {chats.map(chat => (
                  <div
                    key={chat.id}
                    onClick={() => setSelectedChatId(chat.id)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer group text-sm transition-colors",
                      selectedChatId === chat.id ? "bg-primary/20 text-primary" : "hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="truncate">{chat.title}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat.mutate({ id: chat.id }, {
                          onSuccess: () => {
                            if (selectedChatId === chat.id) setSelectedChatId(null);
                            queryClient.invalidateQueries({ queryKey: getListChatsQueryKey() });
                          }
                        });
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {savedOutputs.length > 0 && (
                <>
                  <Separator className="my-4 bg-white/10" />
                  <div className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Saved Outputs
                  </div>
                  <div className="space-y-1">
                    {savedOutputs.map(output => (
                      <div key={output.id} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-white/5 cursor-pointer text-sm group">
                        <div className="flex items-center gap-2 truncate">
                          <Save className="w-4 h-4 text-muted-foreground" />
                          <span className="truncate">{output.title}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSavedOutput.mutate({ id: output.id }, {
                              onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSavedOutputsQueryKey() })
                            });
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ScrollArea>

            <div className="p-4 border-t border-white/10 space-y-4">
              {stats && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/5 rounded p-2 text-center">
                    <div className="text-muted-foreground">Chats</div>
                    <div className="text-lg font-semibold">{stats.totalChats}</div>
                  </div>
                  <div className="bg-white/5 rounded p-2 text-center">
                    <div className="text-muted-foreground">Saved</div>
                    <div className="text-lg font-semibold">{stats.totalSaved}</div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">
                    {isGuest ? "Guest Mode" : "Authenticated"}
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { logout(); setLocation("/"); }}>
                    Exit
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CENTER PANEL */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-br from-background to-background/50">
        <header className="h-14 border-b border-white/10 flex items-center px-4 gap-4 bg-black/10 backdrop-blur-md z-10">
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

          {currentChat && (
            <div className="text-sm font-medium text-muted-foreground hidden md:block truncate max-w-[200px]">
              {currentChat.title}
            </div>
          )}
        </header>

        <ScrollArea className="flex-1 p-4 md:p-8">
          <div className="max-w-4xl mx-auto space-y-6 pb-24">
            {isChatLoading && (
              <div className="flex justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            
            {!isChatLoading && currentChat?.messages.length === 0 && !generate.isPending && (
              <div className="h-[50vh] flex flex-col items-center justify-center text-center opacity-50">
                <Sparkles className="w-12 h-12 mb-4" />
                <h2 className="text-2xl font-semibold mb-2">What shall we build today?</h2>
                <p className="max-w-md text-muted-foreground">
                  Select a mode above and provide a prompt. AutoScribe will generate structured outputs tailored to your needs.
                </p>
              </div>
            )}

            {currentChat?.messages.map((msg, i) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
                className={cn(
                  "flex gap-4 w-full",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "ai" && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                )}
                
                <div className={cn(
                  "max-w-[90%] rounded-2xl p-5 shadow-sm",
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground rounded-tr-sm" 
                    : "bg-white/5 border border-white/10 rounded-tl-sm backdrop-blur-sm"
                )}>
                  {msg.role === "ai" ? (
                    <div className="space-y-4">
                      <Tabs defaultValue="report" className="w-full">
                        <TabsList className="bg-black/20 border border-white/10 mb-4 h-9">
                          <TabsTrigger value="report" className="text-xs h-7 data-[state=active]:bg-primary/20">Report</TabsTrigger>
                          <TabsTrigger value="code" className="text-xs h-7 data-[state=active]:bg-primary/20">Code</TabsTrigger>
                          <TabsTrigger value="docs" className="text-xs h-7 data-[state=active]:bg-primary/20">Docs</TabsTrigger>
                          <TabsTrigger value="insights" className="text-xs h-7 data-[state=active]:bg-primary/20">Insights</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="report" className="mt-0 outline-none">
                          <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border-white/10 max-w-none text-sm">
                            <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="code" className="mt-0 outline-none">
                          <div className="bg-black/50 rounded-md p-4 border border-white/10 overflow-x-auto font-mono text-xs text-muted-foreground">
                            {/* In a real app we'd extract the code blocks, here we just show a simplified version */}
                            <pre><code>{msg.content.replace(/<[^>]*>?/gm, '')}</code></pre>
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="docs" className="mt-0 outline-none">
                           <div className="prose prose-invert max-w-none text-sm border-l-2 border-primary pl-4 py-2">
                            <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                          </div>
                        </TabsContent>
                        
                        <TabsContent value="insights" className="mt-0 outline-none">
                           <div className="bg-primary/5 rounded-md p-4 border border-primary/20 text-sm">
                            <h4 className="font-semibold mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4"/> Key Takeaways</h4>
                            <p className="text-muted-foreground">Generated {msg.mode} output containing {msg.keywords?.split(',').length || 0} key concepts.</p>
                          </div>
                        </TabsContent>
                      </Tabs>
                      
                      {msg.keywords && (
                        <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-white/10">
                          {msg.keywords.split(',').map(k => (
                            <Badge key={k} variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 cursor-default">
                              {k.trim()}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-4">
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1 bg-white/5 border-white/10" onClick={() => {
                          navigator.clipboard.writeText(msg.content.replace(/<[^>]*>?/gm, ''));
                          toast.success("Copied to clipboard");
                        }}>
                          <Copy className="w-3 h-3" /> Copy
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1 bg-white/5 border-white/10" onClick={() => handleDownloadTxt(msg.content.replace(/<[^>]*>?/gm, ''))}>
                          <Download className="w-3 h-3" /> Download TXT
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1 bg-white/5 border-white/10" onClick={() => handleSaveOutput(msg.content)}>
                          <Save className="w-3 h-3" /> Save
                        </Button>
                      </div>
                    </div>
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
                    <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-primary rounded-full" />
                    <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-primary rounded-full" />
                    <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-primary rounded-full" />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">Synthesizing...</span>
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
              <div className="absolute -top-10 left-2 flex items-center gap-2 bg-secondary/20 text-secondary border border-secondary/30 px-3 py-1.5 rounded-full text-xs backdrop-blur-md shadow-lg">
                <FileText className="w-3 h-3" />
                <span className="truncate max-w-[200px] font-medium">{uploadedFile.name}</span>
                <button onClick={() => setUploadedFile(null)} className="hover:text-foreground ml-1">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none px-2">
              {["Summarize", "Explain", "Generate Code", "Extract Keywords"].map(action => (
                <Button 
                  key={action} 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs rounded-full bg-black/40 border-white/10 whitespace-nowrap hover:bg-primary/20 hover:text-primary transition-colors backdrop-blur-md"
                  onClick={() => setInputPrompt(action + " the following: ")}
                >
                  {action}
                </Button>
              ))}
            </div>

            <div className="relative flex items-center bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden focus-within:ring-1 focus-within:ring-primary/50 transition-all p-1">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".txt,.csv" 
                onChange={handleFileUpload} 
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-12 w-12 text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl"
                onClick={() => fileInputRef.current?.click()}
                disabled={generate.isPending || uploadFile.isPending}
              >
                {uploadFile.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
              </Button>
              
              <Input
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a command or drop a file..."
                className="border-0 bg-transparent focus-visible:ring-0 px-2 shadow-none h-12 text-base"
                disabled={generate.isPending}
              />

              <Button
                variant="ghost"
                size="icon"
                className={cn("h-12 w-12 rounded-xl transition-colors", isListening ? "bg-destructive/20 text-destructive" : "text-muted-foreground hover:text-foreground hover:bg-white/5")}
                onClick={isListening ? stopListening : startListening}
                disabled={generate.isPending}
              >
                {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
              </Button>

              <Button 
                onClick={handleSend}
                disabled={(!inputPrompt.trim() && !uploadedFile) || generate.isPending}
                className="h-12 px-6 ml-1 rounded-xl font-medium shadow-lg shadow-primary/20 transition-all"
              >
                {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                {!generate.isPending && "Send"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT INSIGHTS PANEL */}
      <div className="w-80 border-l border-white/10 bg-black/20 backdrop-blur-xl hidden xl:flex flex-col flex-shrink-0 z-10 p-5 space-y-8">
        
        {lastKeywords.length > 0 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Extracted Concepts
            </h3>
            <div className="flex flex-wrap gap-2">
              {lastKeywords.map(k => (
                <Badge key={k} variant="outline" className="bg-white/5 border-white/10 text-xs py-1 px-2 hover:bg-primary/10 transition-colors">
                  {k}
                </Badge>
              ))}
            </div>
          </motion.div>
        )}

        {lastSuggestions.length > 0 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Smart Actions
            </h3>
            <div className="space-y-2">
              {lastSuggestions.map(s => (
                <div 
                  key={s} 
                  onClick={() => setInputPrompt(s)}
                  className="p-3 rounded-xl border border-white/10 bg-white/5 text-sm text-muted-foreground hover:text-foreground hover:bg-white/10 hover:border-white/20 cursor-pointer transition-all shadow-sm"
                >
                  {s}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {stats && stats.modeBreakdown.length > 0 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Activity Metrics
            </h3>
            <div className="space-y-4 p-4 rounded-xl bg-black/40 border border-white/10">
              {stats.modeBreakdown.map(mb => {
                const percentage = stats.totalChats > 0 ? (mb.count / stats.totalChats) * 100 : 0;
                return (
                  <div key={mb.mode} className="space-y-2">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="capitalize">{mb.mode}</span>
                      <span className="text-muted-foreground">{mb.count}</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }} 
                        animate={{ width: `${percentage}%` }} 
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-primary" 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        <div className="mt-auto pt-4">
           <Button 
             variant="outline" 
             className="w-full bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 justify-center gap-2 h-12 rounded-xl"
             onClick={() => {
               const latestAiMsg = currentChat?.messages.filter(m => m.role === 'ai').pop();
               if (latestAiMsg) {
                 handleShare(latestAiMsg.content);
               } else {
                 toast.error("No output to share yet");
               }
             }}
           >
             <Share2 className="w-4 h-4" />
             Generate Share Link
           </Button>
        </div>

      </div>
    </div>
  );
}
