// Fraud Model Runner: everything lives in one resource group and is sized to cost almost nothing when idle.
//   - Storage account #1  private blob container "models" holding the single model.onnx
//   - Storage account #2  static website hosting the React UI
//   - Container Apps      the Spring Boot API, scales to zero replicas when unused
//   - Container Registry  Basic tier, holds the API image
//   - Log Analytics       capped at 0.1 GB per day
targetScope = 'resourceGroup'

@description('Prefix for resource names.')
param namePrefix string = 'fraudrunner'

@description('Azure region.')
param location string = resourceGroup().location

@description('Create the container app. The workflow deploys once with false (to get the registry), pushes the image, then deploys with true.')
param deployApp bool = true

@description('Full image reference for the API, for example myregistry.azurecr.io/fraud-runner-api:abc123.')
param apiImage string = ''

@description('Extra browser origins allowed to call the API and upload to the model container.')
param extraAllowedOrigins array = [
  'http://localhost:5173'
  'http://127.0.0.1:5173'
]

var suffix = uniqueString(resourceGroup().id)
var modelsStorageName = take('stmodels${suffix}', 24)
var uiStorageName = take('stui${suffix}', 24)
var registryName = take('acr${namePrefix}${suffix}', 50)
var identityName = 'id-${namePrefix}-api'
var logName = 'log-${namePrefix}'
var envName = 'cae-${namePrefix}'
var appName = 'ca-${namePrefix}-api'

var roleAcrPull = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var roleBlobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var roleBlobDelegator = 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a'

// ---------- identity used by the API for both pulling its image and reaching storage ----------
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

// ---------- UI: static website (enabled by the workflow, it is a data-plane setting) ----------
resource uiStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: uiStorageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: true
  }
}

var uiOrigin = substring(uiStorage.properties.primaryEndpoints.web, 0, max(0, length(uiStorage.properties.primaryEndpoints.web) - 1))
var allowedOrigins = concat([uiOrigin], extraAllowedOrigins)

// ---------- models: private storage, only reachable through short-lived SAS links ----------
resource modelsStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: modelsStorageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

resource modelsBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: modelsStorage
  name: 'default'
  properties: {
    // The browser uploads straight to the blob, so the UI origin needs CORS here.
    cors: {
      corsRules: [
        {
          allowedOrigins: allowedOrigins
          allowedMethods: ['GET', 'PUT', 'HEAD', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['*']
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource modelsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: modelsBlobService
  name: 'models'
  properties: { publicAccess: 'None' }
}

resource blobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: modelsStorage
  name: guid(modelsStorage.id, identity.id, roleBlobDataContributor)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleBlobDataContributor)
  }
}

// Needed to mint user delegation SAS tokens without an account key.
resource blobDelegator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: modelsStorage
  name: guid(modelsStorage.id, identity.id, roleBlobDelegator)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleBlobDelegator)
  }
}

// ---------- registry ----------
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, roleAcrPull)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleAcrPull)
  }
}

// ---------- API: Container Apps on the consumption plan, zero replicas when idle ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.1') }
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = if (deployApp) {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [acrPull, blobDataContributor, blobDelegator]
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'PORT', value: '8080' }
            { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
            { name: 'STORAGE_ENDPOINT', value: modelsStorage.properties.primaryEndpoints.blob }
            { name: 'STORAGE_CONTAINER', value: modelsContainer.name }
            { name: 'CORS_ALLOWED_ORIGINS', value: join(allowedOrigins, ',') }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: { path: '/actuator/health/liveness', port: 8080 }
              initialDelaySeconds: 3
              periodSeconds: 3
              failureThreshold: 30
            }
            {
              type: 'Liveness'
              httpGet: { path: '/actuator/health/liveness', port: 8080 }
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/actuator/health/readiness', port: 8080 }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'http'
            http: { metadata: { concurrentRequests: '20' } }
          }
        ]
      }
    }
  }
}

output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
output containerAppName string = appName
output apiUrl string = deployApp ? 'https://${app.?properties.configuration.ingress.fqdn}' : ''
output uiUrl string = uiOrigin
output uiStorageName string = uiStorage.name
output modelsStorageName string = modelsStorage.name
