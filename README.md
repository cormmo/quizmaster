# Quizmaster

Quizmaster is a Spring Boot web application with a static browser UI.

## Requirements

You do not need an IDE to run this project. You only need:

- Java Development Kit (JDK) 21
- A terminal or command prompt
- Internet access the first time you run it, so Maven can download dependencies

Check Java with:

```bash
java -version
```

The output should show Java 21. If Java is missing, install JDK 21 from one of these:

- https://adoptium.net/
- https://www.oracle.com/java/technologies/downloads/

## Run From The Terminal

### macOS or Linux

Open a terminal in the project folder and run:

```bash
./mvnw spring-boot:run
```

### Windows

Open Command Prompt or PowerShell in the project folder and run:

```bat
mvnw.cmd spring-boot:run
```

When the app has started, open this URL in a browser:

```text
http://localhost:8080
```

Stop the app with `Ctrl+C` in the terminal.

## Build A Runnable Jar

To build the project:

### macOS or Linux

```bash
./mvnw clean package
```

### Windows

```bat
mvnw.cmd clean package
```

Then run the generated jar:

```bash
java -jar target/quizmaster-0.0.1-SNAPSHOT.jar
```

Open:

```text
http://localhost:8080
```

## Host a Multiplayer Session with ngrok

- Visit https://dashboard.ngrok.com/ and sign up for a free account.
- After signing up, go to the "Getting Started" section, choose your Operating System, and follow the instructions to download and set up ngrok.
- Once ngrok is set up, run the jar file as described above, ensuring your application is running on port 8080.
- In your terminal, start ngrok to forward HTTP traffic to your local server:
```bash
ngrok http 8080
```
- ngrok will provide you with a public URL (e.g., `https://abcd1234.ngrok.io`). Share this URL with your friends to allow them to access your Quizmaster session from their browsers.

## Troubleshooting

- If port `8080` is already in use, stop the other application or run this app on another port:

```bash
./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port=8081
```

- On macOS or Linux, if `./mvnw` is not executable, run:

```bash
chmod +x mvnw
```

- If dependencies fail to download, check your internet connection and try the command again.
