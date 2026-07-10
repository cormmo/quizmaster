package at.seb.quizmaster;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/sessions")
class MultiplayerController {

	private final MultiplayerSessions sessions = new MultiplayerSessions();

	@PostMapping
	CreateSessionResponse createSession(@RequestBody CreateSessionRequest request) {
		return sessions.create(request);
	}

	@GetMapping("/{code}")
	SessionView getSession(@PathVariable String code) {
		return sessions.view(code);
	}

	@PostMapping("/{code}/players")
	JoinSessionResponse joinSession(@PathVariable String code, @RequestBody JoinSessionRequest request) {
		return sessions.join(code, request);
	}

	@PostMapping("/{code}/questions/{questionKey}/select")
	SessionView selectQuestion(
			@PathVariable String code,
			@PathVariable String questionKey,
			@RequestBody SelectQuestionRequest request
	) {
		return sessions.selectQuestion(code, questionKey, request);
	}

	@PostMapping("/{code}/questions/current/close")
	SessionView closeQuestion(@PathVariable String code, @RequestBody CloseQuestionRequest request) {
		return sessions.closeQuestion(code, request);
	}
}

class MultiplayerSessions {

	private static final int QUESTION_SECONDS = 60;
	private static final int MAX_TOPICS = 8;
	private static final int MAX_NICKNAME_LENGTH = 24;
	private static final int[] POINTS = { 100, 200, 300, 400, 500 };
	private static final int MAX_QUESTIONS = MAX_TOPICS * 5;
	private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

	private final SecureRandom random = new SecureRandom();
	private final Map<String, GameSession> sessions = new ConcurrentHashMap<>();

	CreateSessionResponse create(CreateSessionRequest request) {
		List<String> topics = sanitizeTopics(request.topics());
		topics = topicsWithQuestionTopics(topics, request.questions());
		List<QuestionDefinition> questions = sanitizeQuestions(request.questions(), topics);

		if (topics.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one topic is required.");
		}

		if (questions.isEmpty()) {
			questions = defaultQuestions(topics);
		}

		String code = uniqueCode();
		String hostKey = UUID.randomUUID().toString();
		GameSession session = new GameSession(code, hostKey, topics, questions);
		sessions.put(code, session);

		return new CreateSessionResponse(hostKey, toView(session));
	}

	SessionView view(String code) {
		return toView(requiredSession(code));
	}

	JoinSessionResponse join(String code, JoinSessionRequest request) {
		GameSession session = requiredSession(code);
		String nickname = sanitizeNickname(request.nickname());

		synchronized (session) {
			boolean nicknameExists = session.players.stream()
					.anyMatch((player) -> player.nickname.equalsIgnoreCase(nickname));

			if (nicknameExists) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "That nickname is already in use.");
			}

			Player player = new Player(UUID.randomUUID().toString(), nickname);
			session.players.add(player);

			if (session.currentPlayerId == null) {
				session.currentPlayerId = player.id;
			}

			return new JoinSessionResponse(player.id, toView(session));
		}
	}

	SessionView selectQuestion(String code, String questionKey, SelectQuestionRequest request) {
		GameSession session = requiredSession(code);

		synchronized (session) {
			Player player = requiredPlayer(session, request.playerId());

			if (!player.id.equals(session.currentPlayerId)) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "It is not this player's turn.");
			}

			if (session.currentQuestion != null) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "A question is already active.");
			}

			QuestionRef question = questionRef(session, questionKey);

			if (session.played.contains(question.key())) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "This question has already been played.");
			}

			Instant selectedAt = Instant.now();
			session.currentQuestion = new ActiveQuestion(
					question.key(),
					question.topicIndex(),
					question.pointIndex(),
					player.id,
					selectedAt,
					selectedAt.plusSeconds(QUESTION_SECONDS)
			);

			return toView(session);
		}
	}

	SessionView closeQuestion(String code, CloseQuestionRequest request) {
		GameSession session = requiredSession(code);

		synchronized (session) {
			if (!session.hostKey.equals(request.hostKey())) {
				throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the host can close questions.");
			}

			ActiveQuestion activeQuestion = session.currentQuestion;

			if (activeQuestion == null) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "No question is active.");
			}

			Player player = requiredPlayer(session, activeQuestion.playerId);
			QuestionRef question = questionRef(session, activeQuestion.key);

			session.played.add(activeQuestion.key);

			if (request.award()) {
				player.score += question.points();
			}

			session.currentQuestion = null;
			advanceTurn(session, player.id);

			return toView(session);
		}
	}

	private void advanceTurn(GameSession session, String lastPlayerId) {
		if (session.players.isEmpty()) {
			session.currentPlayerId = null;
			return;
		}

		int lastIndex = -1;

		for (int index = 0; index < session.players.size(); index++) {
			if (session.players.get(index).id.equals(lastPlayerId)) {
				lastIndex = index;
				break;
			}
		}

		int nextIndex = lastIndex < 0 ? 0 : (lastIndex + 1) % session.players.size();
		session.currentPlayerId = session.players.get(nextIndex).id;
	}

	private GameSession requiredSession(String code) {
		GameSession session = sessions.get(normalizeCode(code));

		if (session == null) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found.");
		}

		return session;
	}

	private Player requiredPlayer(GameSession session, String playerId) {
		return session.players.stream()
				.filter((player) -> player.id.equals(playerId))
				.findFirst()
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Player not found."));
	}

	private QuestionRef questionRef(GameSession session, String questionKey) {
		String[] parts = questionKey.split(":");

		if (parts.length != 2) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid question key.");
		}

		int topicIndex;
		int pointIndex;

		try {
			topicIndex = Integer.parseInt(parts[0]);
			pointIndex = Integer.parseInt(parts[1]);
		} catch (NumberFormatException exception) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid question key.", exception);
		}

		if (topicIndex < 0 || topicIndex >= session.topics.size() || pointIndex < 0 || pointIndex >= POINTS.length) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid question key.");
		}

		return session.questions.stream()
				.filter((question) -> question.key.equals(questionKey))
				.map((question) -> new QuestionRef(
						question.key,
						question.topicIndex,
						question.pointIndex,
						question.topic,
						question.points,
						question.text
				))
				.findFirst()
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid question key."));
	}

	private SessionView toView(GameSession session) {
		synchronized (session) {
			List<PlayerView> players = session.players.stream()
					.map((player) -> new PlayerView(
							player.id,
							player.nickname,
							player.score,
							player.id.equals(session.currentPlayerId)
					))
					.toList();

			return new SessionView(
					session.code,
					session.topics,
					session.questions.stream()
							.map((question) -> new QuestionDefinitionView(
									question.key,
									question.topicIndex,
									question.pointIndex,
									question.topic,
									question.points,
									question.text
							))
							.toList(),
					session.played.stream().sorted().toList(),
					players,
					session.currentPlayerId,
					questionView(session),
					QUESTION_SECONDS
			);
		}
	}

	private QuestionView questionView(GameSession session) {
		if (session.currentQuestion == null) {
			return null;
		}

		ActiveQuestion activeQuestion = session.currentQuestion;
		QuestionRef question = questionRef(session, activeQuestion.key);
		Player player = requiredPlayer(session, activeQuestion.playerId);
		long remainingSeconds = Math.max(0, Duration.between(Instant.now(), activeQuestion.expiresAt).toSeconds());

		return new QuestionView(
				activeQuestion.key,
				activeQuestion.topicIndex,
				activeQuestion.pointIndex,
				question.topic(),
				question.points(),
				question.text(),
				player.id,
				player.nickname,
				activeQuestion.selectedAt,
				activeQuestion.expiresAt,
				remainingSeconds,
				remainingSeconds == 0
		);
	}

	private List<String> sanitizeTopics(List<String> topics) {
		if (topics == null) {
			return List.of();
		}

		List<String> sanitized = new ArrayList<>();
		Set<String> seen = new HashSet<>();

		for (String topic : topics) {
			String trimmed = topic == null ? "" : topic.trim();
			String key = trimmed.toLowerCase(Locale.ROOT);

			if (trimmed.isEmpty() || seen.contains(key)) {
				continue;
			}

			sanitized.add(trimmed);
			seen.add(key);

			if (sanitized.size() == MAX_TOPICS) {
				break;
			}
		}

		return sanitized;
	}

	private List<String> topicsWithQuestionTopics(List<String> topics, List<QuestionRequest> questions) {
		if (questions == null || topics.size() == MAX_TOPICS) {
			return topics;
		}

		List<String> combined = new ArrayList<>(topics);
		Set<String> seen = new HashSet<>();

		for (String topic : combined) {
			seen.add(topic.toLowerCase(Locale.ROOT));
		}

		for (QuestionRequest question : questions) {
			if (question == null) {
				continue;
			}

			String topic = question.topic() == null ? "" : question.topic().trim();
			String key = topic.toLowerCase(Locale.ROOT);

			if (topic.isEmpty() || seen.contains(key)) {
				continue;
			}

			combined.add(topic);
			seen.add(key);

			if (combined.size() == MAX_TOPICS) {
				break;
			}
		}

		return combined;
	}

	private List<QuestionDefinition> sanitizeQuestions(List<QuestionRequest> questions, List<String> topics) {
		if (questions == null || questions.isEmpty()) {
			return List.of();
		}

		List<QuestionDefinition> sanitized = new ArrayList<>();
		Set<String> usedKeys = new HashSet<>();

		for (QuestionRequest question : questions) {
			if (question == null) {
				continue;
			}

			String topic = question.topic() == null ? "" : question.topic().trim();
			String text = question.text() == null ? "" : question.text().trim();
			int topicIndex = topicIndex(topics, topic);
			int pointIndex = pointIndex(question.points());

			if (topicIndex < 0 || pointIndex < 0 || text.isEmpty()) {
				continue;
			}

			String key = pointKey(topicIndex, pointIndex);

			if (usedKeys.contains(key)) {
				continue;
			}

			sanitized.add(new QuestionDefinition(key, topicIndex, pointIndex, topics.get(topicIndex), POINTS[pointIndex], text));
			usedKeys.add(key);

			if (sanitized.size() == MAX_QUESTIONS) {
				break;
			}
		}

		return sanitized;
	}

	private List<QuestionDefinition> defaultQuestions(List<String> topics) {
		List<QuestionDefinition> questions = new ArrayList<>();

		for (int topicIndex = 0; topicIndex < topics.size(); topicIndex++) {
			for (int pointIndex = 0; pointIndex < POINTS.length; pointIndex++) {
				questions.add(new QuestionDefinition(
						pointKey(topicIndex, pointIndex),
						topicIndex,
						pointIndex,
						topics.get(topicIndex),
						POINTS[pointIndex],
						""
				));
			}
		}

		return questions;
	}

	private int topicIndex(List<String> topics, String topic) {
		for (int index = 0; index < topics.size(); index++) {
			if (topics.get(index).equalsIgnoreCase(topic)) {
				return index;
			}
		}

		return -1;
	}

	private int pointIndex(Integer points) {
		if (points == null) {
			return -1;
		}

		for (int index = 0; index < POINTS.length; index++) {
			if (POINTS[index] == points) {
				return index;
			}
		}

		return -1;
	}

	private String pointKey(int topicIndex, int pointIndex) {
		return topicIndex + ":" + pointIndex;
	}

	private String sanitizeNickname(String nickname) {
		String sanitized = nickname == null ? "" : nickname.trim();

		if (sanitized.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nickname is required.");
		}

		if (sanitized.length() > MAX_NICKNAME_LENGTH) {
			return sanitized.substring(0, MAX_NICKNAME_LENGTH);
		}

		return sanitized;
	}

	private String uniqueCode() {
		String code;

		do {
			code = randomCode();
		} while (sessions.containsKey(code));

		return code;
	}

	private String randomCode() {
		StringBuilder code = new StringBuilder(6);

		for (int index = 0; index < 6; index++) {
			code.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
		}

		return code.toString();
	}

	private String normalizeCode(String code) {
		return code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
	}
}

record CreateSessionRequest(List<String> topics, List<QuestionRequest> questions) {
}

record QuestionRequest(String topic, String text, Integer points) {
}

record CreateSessionResponse(String hostKey, SessionView session) {
}

record JoinSessionRequest(String nickname) {
}

record JoinSessionResponse(String playerId, SessionView session) {
}

record SelectQuestionRequest(String playerId) {
}

record CloseQuestionRequest(String hostKey, boolean award) {
}

record SessionView(
		String code,
		List<String> topics,
		List<QuestionDefinitionView> questions,
		List<String> played,
		List<PlayerView> players,
		String currentPlayerId,
		QuestionView currentQuestion,
		int questionSeconds
) {
}

record PlayerView(String id, String nickname, int score, boolean currentTurn) {
}

record QuestionView(
		String key,
		int topicIndex,
		int pointIndex,
		String topic,
		int points,
		String text,
		String selectedByPlayerId,
		String selectedByNickname,
		Instant selectedAt,
		Instant expiresAt,
		long remainingSeconds,
		boolean expired
) {
}

record QuestionDefinitionView(String key, int topicIndex, int pointIndex, String topic, int points, String text) {
}

record QuestionRef(String key, int topicIndex, int pointIndex, String topic, int points, String text) {
}

class GameSession {

	final String code;
	final String hostKey;
	final List<String> topics;
	final List<QuestionDefinition> questions;
	final List<Player> players = new ArrayList<>();
	final Set<String> played = new HashSet<>();
	String currentPlayerId;
	ActiveQuestion currentQuestion;

	GameSession(String code, String hostKey, List<String> topics, List<QuestionDefinition> questions) {
		this.code = code;
		this.hostKey = hostKey;
		this.topics = List.copyOf(topics);
		this.questions = List.copyOf(questions);
	}
}

class QuestionDefinition {

	final String key;
	final int topicIndex;
	final int pointIndex;
	final String topic;
	final int points;
	final String text;

	QuestionDefinition(String key, int topicIndex, int pointIndex, String topic, int points, String text) {
		this.key = key;
		this.topicIndex = topicIndex;
		this.pointIndex = pointIndex;
		this.topic = topic;
		this.points = points;
		this.text = text;
	}
}

class Player {

	final String id;
	final String nickname;
	int score;

	Player(String id, String nickname) {
		this.id = id;
		this.nickname = nickname;
	}
}

class ActiveQuestion {

	final String key;
	final int topicIndex;
	final int pointIndex;
	final String playerId;
	final Instant selectedAt;
	final Instant expiresAt;

	ActiveQuestion(String key, int topicIndex, int pointIndex, String playerId, Instant selectedAt, Instant expiresAt) {
		this.key = key;
		this.topicIndex = topicIndex;
		this.pointIndex = pointIndex;
		this.playerId = playerId;
		this.selectedAt = selectedAt;
		this.expiresAt = expiresAt;
	}
}
