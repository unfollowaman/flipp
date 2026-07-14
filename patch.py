with open("about/index.html", "r") as f:
    content = f.read()

search_str = """Have questions or feedback? Feel free to
              <a href="mailto:idontknowaman@gmail.com">Contact us</a>."""

replace_str = """Have questions or feedback? Feel free to
              <a href="mailto:idontknowaman@gmail.com">Contact us</a>. You can also review our
              <a href="/privacy-policy/">Privacy Policy</a> and <a href="/terms/">Terms of Service</a>."""

content = content.replace(search_str, replace_str)

with open("about/index.html", "w") as f:
    f.write(content)
