import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";

import { resolvePhotoUrl } from "@/lib/voting";
import { cn } from "@/lib/utils";

export function CandidatePhoto({
  path,
  name,
  className,
}: {
  path: string | null;
  name: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["photo", path],
    queryFn: () => resolvePhotoUrl(path),
    enabled: Boolean(path),
    staleTime: 30 * 60 * 1000,
  });

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground",
        className,
      )}
    >
      {data ? (
        <img src={data} alt={`Photo of ${name}`} className="h-full w-full object-cover" />
      ) : (
        <UserRound className="h-8 w-8" aria-hidden="true" />
      )}
    </div>
  );
}
