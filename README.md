# Love Letter (Online Implementation)

An online implementation of the card game **Love Letter**, allowing
players to play the classic deduction card game through a web interface.

## Overview

This project recreates the mechanics of Love Letter in an online
environment so multiple players can play together remotely. Players draw
and play cards strategically to eliminate opponents and deliver their
letter to the princess.

## Features

-   Multiplayer gameplay
-   Web-based interface
-   Real-time interaction between players
-   Implements the core rules and cards of Love Letter

## Requirements

-   Node.js
-   npm

## Setup

1.  Clone the repository:

```{=html}
git clone [<your-repo-url>](https://github.com/KevZ3742/Love-Letter.git)
cd love letter
```
    

2.  Install dependencies:

```{=html}
npm install
```
    

## Running the Project

Start the server:

    npm run start

Expose the server publicly using ngrok:

    ngrok http 3000

Players can then connect using the public URL provided by ngrok.

## Development

The server runs locally at:

    http://localhost:3000

Using ngrok allows external players to connect to your local game
server.

## Future Improvements

-   Lobby system
-   Player authentication
-   Improved UI/UX
-   Game history and statistics
