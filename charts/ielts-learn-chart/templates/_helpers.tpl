{{/* Tên chart (mặc định "ielts-learn") */}}
{{- define "ielts.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Tên đầy đủ của tài nguyên: <release>-<name>, hoặc chỉ <release> nếu tên release đã chứa <name> */}}
{{- define "ielts.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "ielts.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "ielts.labels" -}}
helm.sh/chart: {{ include "ielts.chart" . }}
{{ include "ielts.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "ielts.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ielts.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "ielts.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "ielts.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "ielts.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end }}

{{/* Tên Secret chứa khoá VAPID (của người dùng hoặc do chart tạo) — rỗng nếu không dùng */}}
{{- define "ielts.vapidSecret" -}}
{{- if .Values.vapid.existingSecret }}
{{- .Values.vapid.existingSecret }}
{{- else if and .Values.vapid.publicKey .Values.vapid.privateKey }}
{{- printf "%s-vapid" (include "ielts.fullname" .) }}
{{- end }}
{{- end }}

{{/* ---------- Hy-MT ---------- */}}
{{- define "ielts.hymt.fullname" -}}
{{- printf "%s-hymt" (include "ielts.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "ielts.hymt.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ielts.name" . }}-hymt
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "ielts.hymt.labels" -}}
helm.sh/chart: {{ include "ielts.chart" . }}
{{ include "ielts.hymt.selectorLabels" . }}
app.kubernetes.io/component: translation-model
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
