#!/usr/bin/env bash
# One-time setup, run by a person who can create resource groups and app registrations:
#   az login
#   infra/bootstrap.sh <github-owner>/<repo> [location] [resource-group]
#
# It creates the resource group, an Entra app registration that GitHub Actions signs in as through OIDC
# (no secret is stored anywhere), gives it rights on that one resource group, and stores the three values the
# Deploy workflow needs as GitHub secrets (needs the gh CLI; otherwise it prints them).
set -euo pipefail

REPO="${1:?usage: bootstrap.sh <github-owner>/<repo> [location] [resource-group]}"
LOCATION="${2:-eastus}"
RG="${3:-rg-fraudrunner-demo}"
APP_NAME="gh-${REPO//\//-}-deploy"

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "Resource group $RG in $LOCATION"
az group create --name "$RG" --location "$LOCATION" --output none
RG_ID=$(az group show --name "$RG" --query id -o tsv)

echo "App registration $APP_NAME"
APP_ID=$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)
if [ -z "$APP_ID" ]; then
  APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
  az ad sp create --id "$APP_ID" --output none
fi

echo "Federated credential for ${REPO} (main branch)"
if ! az ad app federated-credential list --id "$APP_ID" --query "[?name=='github-main']" -o tsv | grep -q .; then
  az ad app federated-credential create --id "$APP_ID" --parameters "{
    \"name\": \"github-main\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:${REPO}:ref:refs/heads/main\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" --output none
fi

echo "Roles on $RG"
# Contributor creates the resources; User Access Administrator lets the template grant the API's managed identity
# access to storage and the registry.
for ROLE in "Contributor" "User Access Administrator"; do
  az role assignment create --assignee "$APP_ID" --role "$ROLE" --scope "$RG_ID" --output none || true
done

if command -v gh >/dev/null 2>&1; then
  echo "Storing GitHub secrets on $REPO"
  gh secret set AZURE_CLIENT_ID --repo "$REPO" --body "$APP_ID"
  gh secret set AZURE_TENANT_ID --repo "$REPO" --body "$TENANT_ID"
  gh secret set AZURE_SUBSCRIPTION_ID --repo "$REPO" --body "$SUBSCRIPTION_ID"
  if [ "$RG" != "rg-fraudrunner-demo" ]; then gh variable set AZURE_RESOURCE_GROUP --repo "$REPO" --body "$RG"; fi
else
  echo "Add these as GitHub repository secrets:"
  echo "  AZURE_CLIENT_ID=$APP_ID"
  echo "  AZURE_TENANT_ID=$TENANT_ID"
  echo "  AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
  [ "$RG" != "rg-fraudrunner-demo" ] && echo "And the repository variable AZURE_RESOURCE_GROUP=$RG"
fi
echo "Done. Push to main (or run the Deploy workflow) to build and deploy."
