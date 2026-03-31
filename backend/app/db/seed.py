from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.models import Customer, Order, OrderItem, Product, User


def seed_data(db: Session) -> None:
    if not db.query(User).first():
        demo = User(
            email="admin@example.com",
            username="admin",
            hashed_password=get_password_hash("admin123"),
            full_name="Demo Admin",
        )
        db.add(demo)
        db.commit()

    if db.query(Customer).first():
        return

    customers = [
        Customer(name="Alice Johnson", email="alice@example.com"),
        Customer(name="Bob Smith", email="bob@example.com"),
    ]
    products = [
        Product(name="Laptop", category="Electronics", price=1200.0),
        Product(name="Mouse", category="Electronics", price=25.0),
        Product(name="Desk Chair", category="Furniture", price=180.0),
    ]
    db.add_all(customers + products)
    db.flush()

    orders = [
        Order(customer_id=customers[0].id),
        Order(customer_id=customers[1].id),
    ]
    db.add_all(orders)
    db.flush()

    items = [
        OrderItem(order_id=orders[0].id, product_id=products[0].id, quantity=1, unit_price=1200.0),
        OrderItem(order_id=orders[0].id, product_id=products[1].id, quantity=2, unit_price=25.0),
        OrderItem(order_id=orders[1].id, product_id=products[2].id, quantity=1, unit_price=180.0),
    ]
    db.add_all(items)
    db.commit()
