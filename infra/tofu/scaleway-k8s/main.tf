terraform {
  required_providers {
    scaleway = {
      source = "scaleway/scaleway"
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

output "kubeconfig" {
  value     = scaleway_k8s_cluster.main.kubeconfig[0].config_file
  sensitive = true
}
