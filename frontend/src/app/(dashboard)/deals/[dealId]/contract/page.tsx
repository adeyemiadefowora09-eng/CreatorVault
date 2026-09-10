"use client";

import { use } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useDeal } from "@/hooks/useDeals";
import {
  useAnalyzeDealContract,
  useContractForDeal,
  useSignContract,
  useUploadContract,
} from "@/hooks/useContract";
import { useAuthStore } from "@/stores/authStore";

function CreateContractForm({ dealId }: { dealId: string }) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ rawText: string }>();
  const uploadContract = useUploadContract();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">No contract yet</CardTitle>
        <CardDescription>Paste the contract text below to attach it to this deal.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => uploadContract.mutate({ dealId, rawText: values.rawText }))}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="rawText">Contract text</Label>
            <Textarea
              id="rawText"
              rows={10}
              placeholder="Paste the full contract text (50+ characters)…"
              aria-invalid={Boolean(errors.rawText)}
              {...register("rawText", { required: "Contract text is required", minLength: { value: 50, message: "Needs to be at least 50 characters" } })}
            />
            {errors.rawText && <p className="text-sm text-destructive">{errors.rawText.message}</p>}
          </div>
          {uploadContract.isError && (
            <p className="text-sm text-destructive">Couldn&apos;t save that contract. Try again.</p>
          )}
          <Button type="submit" disabled={uploadContract.isPending}>
            {uploadContract.isPending ? "Saving…" : "Attach contract"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ContractPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = use(params);
  const user = useAuthStore((s) => s.user);
  const { data: deal } = useDeal(dealId);
  const { data: contract, isLoading, isError } = useContractForDeal(dealId);
  const signContract = useSignContract();
  const analyzeContract = useAnalyzeDealContract();

  const isCreator = deal?.creatorId === user?.id;
  const isBrand = deal?.brandId === user?.id;
  const hasSigned = (isCreator && contract?.signedByCreator) || (isBrand && contract?.signedByBrand);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href={`/deals/${dealId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to deal
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-foreground">Contract</h1>
        {deal && <p className="mt-1 text-sm text-muted-foreground">{deal.title}</p>}
      </header>

      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading contract…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Couldn&apos;t load the contract.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && !contract && <CreateContractForm dealId={dealId} />}

      {contract && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Contract status: {contract.status.replace("_", " ")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-6 text-sm">
                <span className={contract.signedByCreator ? "text-emerald-600" : "text-muted-foreground"}>
                  {contract.signedByCreator ? "✓" : "—"} Creator signed
                </span>
                <span className={contract.signedByBrand ? "text-emerald-600" : "text-muted-foreground"}>
                  {contract.signedByBrand ? "✓" : "—"} Brand signed
                </span>
              </div>

              {(isCreator || isBrand) && !hasSigned && contract.status !== "SIGNED" && (
                <Button size="sm" onClick={() => signContract.mutate(contract.id)} disabled={signContract.isPending}>
                  {signContract.isPending ? "Signing…" : "Sign contract"}
                </Button>
              )}
              {hasSigned && (
                <p className="flex items-center gap-1 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  You&apos;ve signed this contract.
                </p>
              )}
              {signContract.isError && (
                <p className="text-sm text-destructive">Couldn&apos;t sign — try refreshing the page.</p>
              )}

              {contract.rawText && (
                <details className="pt-2">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    View contract text
                  </summary>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                    {contract.rawText}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>

          {contract.analysis && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI risk analysis</CardTitle>
                <CardDescription>
                  Risk level: {contract.analysis.riskLevel} · Risk score: {contract.analysis.riskScore}/100
                  {" "}(higher = riskier)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground">{contract.analysis.summary}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => analyzeContract.mutate(contract.id)}
                  disabled={analyzeContract.isPending}
                >
                  {analyzeContract.isPending ? "Re-analyzing…" : "Re-run analysis"}
                </Button>
              </CardContent>
            </Card>
          )}

          {!contract.analysis && (
            <Card>
              <CardContent className="space-y-3 py-5">
                <p className="text-sm text-muted-foreground">
                  No AI analysis has been run on this contract yet. Run Deal Guardian against
                  the actual attached text before signing.
                </p>
                <Button
                  size="sm"
                  onClick={() => analyzeContract.mutate(contract.id)}
                  disabled={analyzeContract.isPending}
                >
                  {analyzeContract.isPending ? "Analyzing…" : "Run AI analysis"}
                </Button>
                {analyzeContract.isError && (
                  <p className="text-sm text-destructive">
                    Couldn&apos;t analyze this contract. Try again.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
