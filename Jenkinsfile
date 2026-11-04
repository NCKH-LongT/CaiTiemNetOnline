pipeline {
  agent { label 'netverse-docker' }
  options {
    skipDefaultCheckout(true)
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20', daysToKeepStr: '14'))
    timeout(time: 45, unit: 'MINUTES')
  }
  environment {
    COMPOSE_PROJECT_NAME = 'netverse3d'
    CI = 'true'
    DEPLOY_ROOT = '/srv/netverse-deploy'
  }
  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.DEPLOY_COMMIT = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
          env.DEPLOY_MAIN = sh(
            script: 'test "$DEPLOY_COMMIT" = "$(git rev-parse refs/remotes/origin/main 2>/dev/null)" && echo true || echo false',
            returnStdout: true
          ).trim()
        }
      }
    }
    stage('Check agent tools') {
      steps {
        sh '''
          set -eu
          command -v node >/dev/null || { echo 'Agent netverse-docker needs Node.js 22; see docs/JENKINS.md' >&2; exit 1; }
          command -v npm >/dev/null || { echo 'Agent netverse-docker needs npm; see docs/JENKINS.md' >&2; exit 1; }
          command -v docker >/dev/null || { echo 'Agent netverse-docker needs Docker CLI; see docs/JENKINS.md' >&2; exit 1; }
          node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
          npm --version
          docker info >/dev/null
          docker compose version
        '''
      }
    }
    stage('Quality and build') {
      steps {
        sh '''
          set -eu
          npm ci
          npm run lint
          npm run typecheck
          npm run test
          npm run build
        '''
      }
    }
    stage('Approve production deploy') {
      when { environment name: 'DEPLOY_MAIN', value: 'true' }
      steps { input message: 'Deploy NETVERSE main to production?', ok: 'Deploy' }
    }
    stage('Build and deploy main') {
      when { environment name: 'DEPLOY_MAIN', value: 'true' }
      steps {
        withCredentials([file(credentialsId: 'netverse-prod-env', variable: 'DEPLOY_ENV')]) {
          sh '''
            set -eu
            release="$DEPLOY_ROOT/releases/$DEPLOY_COMMIT"
            mkdir -p "$release"
            tar -C "$WORKSPACE" --exclude='./.git' --exclude='./node_modules' \
              --exclude='./apps/web/.next' --exclude='./.env' --exclude='./.env.*' \
              --exclude='./infra/jenkins/agent.env' \
              -cf - . | tar -C "$release" -xf -
            cd "$release"
            export IMAGE_TAG="$DEPLOY_COMMIT"
            docker compose --env-file "$DEPLOY_ENV" config --quiet
            previous_container="$(docker compose --env-file "$DEPLOY_ENV" ps -q web || true)"
            previous_tag=""
            previous_release=""
            if [ -n "$previous_container" ]; then
              previous_image="$(docker inspect --format '{{.Config.Image}}' "$previous_container")"
              previous_tag="${previous_image##*:}"
              previous_release="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$previous_container")"
            fi
            rollback() {
              if [ -n "$previous_tag" ] && [ -d "$previous_release" ]; then
                (
                  cd "$previous_release"
                  IMAGE_TAG="$previous_tag" docker compose --env-file "$DEPLOY_ENV" up -d --no-build --remove-orphans
                  IMAGE_TAG="$previous_tag" docker compose --env-file "$DEPLOY_ENV" up -d --no-build --force-recreate gateway
                )
              fi
            }
            docker compose --env-file "$DEPLOY_ENV" build --pull
            if ! (docker compose --env-file "$DEPLOY_ENV" up -d --no-build --remove-orphans && \
                  docker compose --env-file "$DEPLOY_ENV" up -d --no-build --force-recreate gateway); then
              rollback
              exit 1
            fi
            for i in $(seq 1 30); do
              if docker compose --env-file "$DEPLOY_ENV" exec -T gateway wget -q -O /dev/null http://127.0.0.1/health && \
                 docker compose --env-file "$DEPLOY_ENV" exec -T gateway wget -q -O /dev/null http://127.0.0.1/api/ready && \
                 docker compose --env-file "$DEPLOY_ENV" exec -T gateway wget -q -O /dev/null http://127.0.0.1/socket/ready && \
                 docker compose --env-file "$DEPLOY_ENV" exec -T gateway wget -q -O /dev/null http://127.0.0.1/; then
                break
              fi
              if [ "$i" -eq 30 ]; then
                docker compose --env-file "$DEPLOY_ENV" ps
                rollback
                exit 1
              fi
              sleep 2
            done
            docker compose --env-file "$DEPLOY_ENV" ps
          '''
        }
      }
    }
    stage('Prune old NETVERSE images') {
      when { environment name: 'DEPLOY_MAIN', value: 'true' }
      steps {
        sh '''
          set -eu
          docker image prune -a -f \
            --filter 'label=org.netverse.project=netverse-3d' \
            --filter 'until=168h'
        '''
      }
    }
  }
  post {
    always {
      script {
        try {
          deleteDir()
        } catch (org.jenkinsci.plugins.workflow.steps.MissingContextVariableException ignored) {
          echo 'Skipping workspace cleanup: no agent workspace was allocated.'
        }
      }
    }
  }
}
