FROM node:22-bookworm-slim AS node
FROM docker:27-cli AS dockercli

FROM jenkins/inbound-agent:latest-jdk21
USER root
COPY --from=dockercli /usr/local/ /usr/local/
COPY --from=node /usr/local/ /usr/local/
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates tar \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /srv/netverse-jenkins-agent /srv/netverse-deploy
ENV JENKINS_AGENT_WORKDIR=/srv/netverse-jenkins-agent
WORKDIR /srv/netverse-jenkins-agent
