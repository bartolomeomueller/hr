terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
    }

    time = {
      source = "hashicorp/time"
    }
  }

  required_version = ">= 0.13"
}

resource "scaleway_vpc_private_network" "main" {
  name = "hierphant-test-private-network"
}

resource "scaleway_k8s_cluster" "main" {
  name                        = "hierphant-test-cluster"
  type                        = "kapsule"
  version                     = "1.32.3"
  cni                         = "cilium"
  private_network_id          = scaleway_vpc_private_network.main.id
  delete_additional_resources = true
}

resource "scaleway_k8s_pool" "default" {
  cluster_id  = scaleway_k8s_cluster.main.id
  name        = "default"
  node_type   = "DEV1-M"
  size        = 1
  min_size    = 0
  max_size    = 1
  autoscaling = true
  autohealing = true
}

resource "scaleway_registry_namespace" "main" {
  name        = "hierphant-test"
  description = "Container images for the Hierphant test Kubernetes cluster."
  is_public   = false
}

resource "scaleway_lb_ip" "web_app" {
  zone = "fr-par-1"
}

resource "scaleway_iam_application" "registry_puller" {
  name = "hierphant-k8s-image-puller"
}

resource "scaleway_iam_policy" "registry_puller" {
  name           = "hierphant-k8s-image-puller"
  description    = "Allows Kubernetes to pull private Hierphant container images."
  application_id = scaleway_iam_application.registry_puller.id

  rule {
    project_ids          = [scaleway_registry_namespace.main.project_id]
    permission_set_names = ["ContainerRegistryReadOnly"]
  }
}

resource "time_static" "registry_puller_api_key_created_at" {}

resource "scaleway_iam_api_key" "registry_puller" {
  application_id     = scaleway_iam_application.registry_puller.id
  default_project_id = scaleway_registry_namespace.main.project_id
  description        = "Kubernetes image pull secret for the Hierphant web app."
  expires_at         = timeadd(time_static.registry_puller_api_key_created_at.rfc3339, "8760h")
}

output "kubeconfig" {
  value     = scaleway_k8s_cluster.main.kubeconfig[0].config_file
  sensitive = true
}

output "registry_endpoint" {
  value = scaleway_registry_namespace.main.endpoint
}

output "web_app_load_balancer_ip" {
  value = scaleway_lb_ip.web_app.ip_address
}

output "registry_puller_access_key" {
  value     = scaleway_iam_api_key.registry_puller.access_key
  sensitive = true
}

output "registry_puller_secret_key" {
  value     = scaleway_iam_api_key.registry_puller.secret_key
  sensitive = true
}
