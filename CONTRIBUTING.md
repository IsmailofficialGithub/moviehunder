# Contribution Guide

Thank you for your interest in improving this project. Contributions of all kinds are welcome, whether it's fixing bugs, improving performance, or suggesting new ideas.

---

## Ways to Contribute

### Bug Reports

If you encounter an issue:

* Open a new issue in the repository
* Clearly explain what went wrong
* Provide steps to reproduce the problem
* Include relevant details such as environment, logs, or screenshots if applicable

---

### Feature Requests

Have an idea to improve the API?

* Check existing issues to avoid duplicates
* Create a new issue describing your idea
* Explain the use case and potential impact

---

### Submitting Changes

To contribute code:

1. Fork the repository
2. Create a new branch based on the main branch
3. Make your changes with clear and clean commits
4. Test your implementation locally
5. Submit a pull request with a proper description

---

## Local Development Setup

### Install Dependencies

```bash
pip install fastapi uvicorn httpx beautifulsoup4 curl_cffi
```

### Run Development Server

```bash
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

### Validate Changes

```bash
python verify.py
```

---

## Code Standards

* Follow consistent formatting and structure
* Write readable and maintainable code
* Keep functions modular and simple
* Ensure your changes do not break existing endpoints

---

## Best Practices

* Keep pull requests focused and minimal
* Add comments where necessary
* Avoid unnecessary dependencies
* Maintain backward compatibility where possible

---

## Community Guidelines

Please maintain respectful communication and constructive discussions while collaborating.

---

Thank you for contributing to this project.
