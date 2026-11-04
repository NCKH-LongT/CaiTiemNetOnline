pipeline {
  agent { label 'netverse-docker' }
  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20', daysToKeepStr: '14'))
    timeout(time: 45, unit: 'MINUTES')
  }
  environment {
    COMPOSE_PROJECT_NAME = 'netverse3d'
    CI = 'true'
  }
  stages {
    stage('Checkout') {
      steps { checkout scm }
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
      when { branch 'main' }
      steps { input message: 'Deploy NETVERSE main to production?', ok: 'Deploy' }
    }
    stage('Build and deploy main') {
      when { branch 'main' }
      steps {
        withCredentials([file(credentialsId: 'netverse-prod-env', variable: 'DEPLOY_ENV')]) {
          sh '''
            set -eu
            export IMAGE_TAG="${GIT_COMMIT}"
            docker compose --env-file "$DEPLOY_ENV" config --quiet
            previous_container="$(docker compose --env-file "$DEPLOY_ENV" ps -q web || true)"
            previous_tag=""
            if [ -n "$previous_container" ]; then
              previous_image="$(docker inspect --format '{{.Config.Image}}' "$previous_container")"
              previous_tag="${previous_image##*:}"
            fi
            rollback() {
              if [ -n "$previous_tag" ]; then
                IMAGE_TAG="$previous_tag" docker compose --env-file "$DEPLOY_ENV" up -d --no-build --remove-orphans
              fi
            }
            docker compose --env-file "$DEPLOY_ENV" build --pull
            if ! docker compose --env-file "$DEPLOY_ENV" up -d --no-build --remove-orphans; then
              rollback
              exit 1
            fi
            gateway="http://$(docker compose --env-file "$DEPLOY_ENV" port gateway 80)"
            for i in $(seq 1 30); do
              if curl -fsS "$gateway/health" >/dev/null && \
                 curl -fsS "$gateway/api/ready" >/dev/null && \
                 curl -fsS "$gateway/socket/ready" >/dev/null && \
                 curl -fsS "$gateway/" >/dev/null; then
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
      when { branch 'main' }
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
    always { deleteDir() }
  }
}
