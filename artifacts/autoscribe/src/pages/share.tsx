import { useParams } from "wouter";
import { useGetSharedOutput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Sparkles, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const { data: output, isLoading, isError } = useGetSharedOutput(token, {
    query: {
      enabled: !!token,
      queryKey: ["share", token]
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !output) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Card className="w-full max-w-md bg-black/40 backdrop-blur-xl border-white/10">
          <CardHeader>
            <CardTitle className="text-center text-destructive">Output Not Found</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            This shared link might be invalid or has expired.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-4xl z-10 space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">AutoScribe AI+</h1>
          </div>
          <div className="text-sm text-muted-foreground">
            Shared on {format(new Date(output.createdAt), "MMM d, yyyy")}
          </div>
        </header>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10 bg-white/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl font-semibold">{output.title}</CardTitle>
                <Badge variant="secondary" className="capitalize">
                  {output.mode}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border-white/10 max-w-none">
                <div dangerouslySetInnerHTML={{ __html: output.content }} />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
