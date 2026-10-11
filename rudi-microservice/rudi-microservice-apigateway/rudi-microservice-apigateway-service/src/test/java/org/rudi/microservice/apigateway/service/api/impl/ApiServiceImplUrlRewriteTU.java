package org.rudi.microservice.apigateway.service.api.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Teste la traduction d'hôte optionnelle appliquée par {@link ApiServiceImpl}
 * avant la persistance d'une route (createSimpleApi/updateSimpleApi), sans
 * contexte Spring : la logique est une simple substitution de chaîne.
 */
class ApiServiceImplUrlRewriteTU {

	@Test
	@DisplayName("Sans configuration (from vide), l'URL n'est pas modifiée")
	void noRewriteWhenFromBlank() {
		String url = "http://localhost:4031/storage/download/abc";
		assertThat(ApiServiceImpl.rewriteUrlHost(url, "", "host.docker.internal:4031")).isEqualTo(url);
		assertThat(ApiServiceImpl.rewriteUrlHost(url, null, "host.docker.internal:4031")).isEqualTo(url);
	}

	@Test
	@DisplayName("Avec configuration, l'hôte:port est réécrit, le reste de l'URL inchangé")
	void rewritesHostWhenConfigured() {
		String url = "http://localhost:4031/storage/download/abc?x=1";
		String rewritten = ApiServiceImpl.rewriteUrlHost(url, "localhost:4031", "host.docker.internal:4031");
		assertThat(rewritten).isEqualTo("http://host.docker.internal:4031/storage/download/abc?x=1");
	}

	@Test
	@DisplayName("Si l'URL ne contient pas l'hôte visé, elle reste inchangée")
	void leavesUrlUnchangedWhenHostNotPresent() {
		String url = "http://some-other-host:9999/storage/download/abc";
		assertThat(ApiServiceImpl.rewriteUrlHost(url, "localhost:4031", "host.docker.internal:4031")).isEqualTo(url);
	}

	@Test
	@DisplayName("URL nulle : pas d'exception, retourne null")
	void handlesNullUrl() {
		assertThat(ApiServiceImpl.rewriteUrlHost(null, "localhost:4031", "host.docker.internal:4031")).isNull();
	}
}
